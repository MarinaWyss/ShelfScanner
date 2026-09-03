"""In-memory stand-ins for the two seams the web layer has: sessions and the pipeline.

Used by the unit tests, the Playwright suite, and `SHELFSCANNER_FAKE_PIPELINE=1`
for running the server with no Supabase project and no provider key. The fake
pipeline still goes through `router.vision` and `router.text`, so the router
seam is exercised, and it keeps its rows in the same shape the tables have so
`web.metrics` can be tested on them.
"""

from __future__ import annotations

import time
from datetime import UTC, datetime
from itertools import count
from typing import Any

from shelfscanner import router
from shelfscanner.adapters.base import DEFAULT_MAX_TOKENS, RECOMMENDATIONS_SCHEMA, CallResult
from shelfscanner.config import Model
from shelfscanner.extract import titles_from
from shelfscanner.recommend import prefs_text, recs_from, shelf_text
from shelfscanner.router import Progress
from shelfscanner.web.pipeline import CHOOSING_PROMPT, Choosing, Pick, PickState, Reading, SavedPick, Scan, _states

DEFAULT_TITLES = ["Dune", "The Left Hand of Darkness", "Piranesi", "Kindred", "Annihilation", "The Dispossessed",
                  "Solaris"]
DEFAULT_PICKS = [
    {"title": "Piranesi", "reason": "A short, strange house of a novel; you asked for atmosphere over plot."},
    {"title": "The Left Hand of Darkness", "reason": "Le Guin's ideas-first science fiction, which you rated highly."},
    {"title": "Kindred", "reason": "Time travel used for something serious; Butler is on your to-read list."},
    {"title": "Annihilation", "reason": "Weird, eerie and brief, in the vein of what you loved last year."},
    {"title": "Solaris", "reason": "Philosophical first contact, the classic behind books you already like."},
]


class FakeClient:
    """A ModelClient that answers with fixed JSON, or with an error, after an optional delay.

    `parsed` answers vision calls (the shelf), `picks` answers text calls (the choosing stage);
    `error` fails vision calls and `text_error` text calls.
    """

    def __init__(self, parsed: Any = None, *, picks: Any = None, error: str | None = None,
                 text_error: str | None = None, delay_s: float = 0.0) -> None:
        self.parsed = parsed if parsed is not None else {"books": [{"title": t} for t in DEFAULT_TITLES]}
        self.picks = picks if picks is not None else {"recommendations": list(DEFAULT_PICKS)}
        self.error = error
        self.text_error = text_error
        self.delay_s = delay_s
        self.calls: list[tuple[str, str, int]] = []
        self.inputs: list[str] = []  # the input_text of every text call, so tests can see what the model was told

    def vision(self, model: Model, prompt: str, image_jpeg: bytes, *, max_tokens: int = DEFAULT_MAX_TOKENS,
               on_progress: Progress | None = None, schema: dict | None = None) -> CallResult:
        self.calls.append(("vision", model.alias, len(image_jpeg)))
        if on_progress:
            on_progress("reading")
        if self.delay_s:
            time.sleep(self.delay_s)
        if self.error:
            return CallResult(model.slug, "fake", None, None, None, None, None, 1, self.error, adapter="fake")
        return CallResult(model.slug, "fake", "{}", self.parsed, 10, 5, 0.0, 1, None, "stop", adapter="fake")

    def text(self, model: Model, prompt: str, input_text: str, *, max_tokens: int = DEFAULT_MAX_TOKENS,
             on_progress: Progress | None = None, schema: dict | None = None) -> CallResult:
        self.calls.append(("text", model.alias, len(input_text)))
        self.inputs.append(input_text)
        if on_progress:
            on_progress("choosing")
        if self.delay_s:
            time.sleep(self.delay_s)
        if self.text_error:
            return CallResult(model.slug, "fake", None, None, None, None, None, 1, self.text_error, adapter="fake")
        return CallResult(model.slug, "fake", "{}", self.picks, 10, 5, 0.0, 1, None, "stop", adapter="fake")


class MemorySessions:
    def __init__(self) -> None:
        self.rows: dict[str, int] = {}
        self.seen: dict[int, int] = {}
        self._ids = count(1)

    def find(self, token_hash: str) -> int | None:
        session_id = self.rows.get(token_hash)
        if session_id is not None:
            self.seen[session_id] = self.seen.get(session_id, 0) + 1
        return session_id

    def create(self, token_hash: str) -> int:
        session_id = next(self._ids)
        self.rows[token_hash] = session_id
        return session_id


def _now() -> str:
    return datetime.now(UTC).isoformat()


class FakePipeline:
    """Photos in a dict, readings and choosings from a FakeClient through the router, and the
    preferences, saved and feedback rows in lists shaped like their tables. `fail_store` makes
    the upload stage fail so the error path can be tested."""

    def __init__(self, client: FakeClient | None = None, *, fail_store: str | None = None) -> None:
        self.client = client or FakeClient()
        self.fail_store = fail_store
        self.blobs: dict[str, bytes] = {}
        self.photos: dict[int, dict] = {}
        self.readings: dict[int, Reading] = {}
        self.choosings: dict[int, Choosing] = {}
        self.recommendations: dict[int, dict] = {}  # id -> {id, photo_id, session_id, parsed_recommendations, preferences, error}
        self.prefs: dict[int, dict] = {}
        self.saved_rows: list[dict] = []
        self.feedback_rows: list[dict] = []
        self._ids = count(1)
        self._rec_ids = count(1)
        self._row_ids = count(1)

    # --- the scan -------------------------------------------------------------------------------

    def store(self, session_id: int, jpeg: bytes) -> dict:
        if self.fail_store:
            raise RuntimeError(self.fail_store)
        photo_id = next(self._ids)
        storage_path = f"sessions/{session_id}/{photo_id}.jpg"
        self.blobs[storage_path] = jpeg
        row = {"id": photo_id, "storage_path": storage_path, "titles": [], "partial_titles": [],
               "notes": None, "session_id": session_id, "created_at": _now()}
        self.photos[photo_id] = row
        return row

    def photo(self, photo_id: int, session_id: int) -> dict | None:
        row = self.photos.get(photo_id)
        return row if row and row["session_id"] == session_id else None

    def read(self, photo: dict, on_progress: Progress) -> Reading:
        res = router.vision(router.primary("reading"), "fake prompt", self.blobs[photo["storage_path"]],
                            client=self.client, on_progress=on_progress)
        reading = (Reading(titles=titles_from(res.parsed), extraction_id=photo["id"]) if res.ok
                   else Reading(error=res.error, extraction_id=photo["id"]))
        self.readings[photo["id"]] = reading
        return reading

    def choose(self, photo: dict, reading: Reading, prefs: dict, on_progress: Progress) -> Choosing:
        shelf = {"books": [{"title": t} for t in reading.titles]}
        text = f"Books on the shelf:\n{shelf_text(shelf)}\n\nReading preferences:\n{prefs_text(prefs, CHOOSING_PROMPT)}"
        res = router.text(router.primary("choosing"), "fake prompt", text, client=self.client, on_progress=on_progress,
                          schema=RECOMMENDATIONS_SCHEMA)
        rec_id = next(self._rec_ids)
        self.recommendations[rec_id] = {"id": rec_id, "photo_id": photo["id"], "session_id": photo["session_id"],
                                        "parsed_recommendations": res.parsed if res.ok else None,
                                        "preferences": prefs, "error": res.error}
        if res.ok:
            choosing = Choosing(picks=[Pick(r.title, r.reason) for r in recs_from(res.parsed)], recommendation_id=rec_id)
        else:
            choosing = Choosing(error=res.error, recommendation_id=rec_id)
        self.choosings[photo["id"]] = choosing
        return choosing

    def result(self, photo_id: int) -> Scan | None:
        reading = self.readings.get(photo_id)
        return Scan(reading, self.choosings.get(photo_id)) if reading else None

    # --- preferences ----------------------------------------------------------------------------

    def preferences(self, session_id: int) -> dict | None:
        return self.prefs.get(session_id)

    def save_preferences(self, session_id: int, prefs: dict) -> None:
        self.prefs[session_id] = prefs

    # --- save and feedback ----------------------------------------------------------------------

    def recommendation(self, recommendation_id: int, session_id: int) -> list[Pick] | None:
        rec = self.recommendations.get(recommendation_id)
        if not rec or rec["session_id"] != session_id or rec["error"]:
            return None
        return [Pick(r.title, r.reason) for r in recs_from(rec["parsed_recommendations"])]

    def _rows(self, rows: list[dict], session_id: int, recommendation_id: int) -> list[dict]:
        return [r for r in rows if r["session_id"] == session_id and r["recommendation_id"] == recommendation_id]

    def pick_states(self, session_id: int, recommendation_id: int) -> dict[int, PickState]:
        return _states(self._rows(self.saved_rows, session_id, recommendation_id),
                       self._rows(self.feedback_rows, session_id, recommendation_id))

    def save(self, session_id: int, recommendation_id: int, pick_index: int) -> None:
        self.saved_rows.append({"id": next(self._row_ids), "session_id": session_id, "recommendation_id": recommendation_id,
                                "pick_index": pick_index, "created_at": _now(), "removed_at": None})

    def unsave(self, session_id: int, recommendation_id: int, pick_index: int) -> None:
        for r in self._rows(self.saved_rows, session_id, recommendation_id):
            if r["pick_index"] == pick_index and r["removed_at"] is None:
                r["removed_at"] = _now()

    def mark(self, session_id: int, recommendation_id: int, pick_index: int, kind: str) -> None:
        self.feedback_rows.append({"id": next(self._row_ids), "session_id": session_id,
                                   "recommendation_id": recommendation_id, "pick_index": pick_index, "kind": kind,
                                   "created_at": _now()})

    def saved(self, session_id: int) -> list[SavedPick]:
        out = []
        for r in sorted(self.saved_rows, key=lambda r: r["id"], reverse=True):
            if r["session_id"] != session_id or r["removed_at"] is not None:
                continue
            rec = self.recommendations[r["recommendation_id"]]
            pick = recs_from(rec["parsed_recommendations"])[r["pick_index"]]
            out.append(SavedPick(r["recommendation_id"], r["pick_index"], pick.title, pick.reason, r["created_at"],
                                 self.photos[rec["photo_id"]]["created_at"]))
        return out
