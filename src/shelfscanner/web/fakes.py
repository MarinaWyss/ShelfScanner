"""In-memory stand-ins for the two seams the web layer has: sessions and the pipeline.

Used by the unit tests, the Playwright suite, and `SHELFSCANNER_FAKE_PIPELINE=1`
for running the server with no Supabase project and no provider key. The fake
pipeline still goes through `router.with_failover`, `router.vision` and
`router.text`, so the router seam and the failover are exercised, and it keeps
its rows in the same shape the tables have so `web.metrics` and `web.limits`
can be tested on them. Both fakes take a `clock` so the limits, the stage lock
and the `last_seen_at` throttle can be tested without waiting.
"""

from __future__ import annotations

import time
from collections.abc import Callable
from datetime import UTC, datetime
from itertools import count
from typing import Any

from shelfscanner import router
from shelfscanner.adapters.base import DEFAULT_MAX_TOKENS, RECOMMENDATIONS_SCHEMA, CallResult
from shelfscanner.config import Model
from shelfscanner.extract import titles_from
from shelfscanner.recommend import prefs_text, recs_from, shelf_text
from shelfscanner.router import Progress
from shelfscanner.verify import PROGRESS_MESSAGE as CHECKING_NOTE
from shelfscanner.web.pipeline import (
    CHOOSING_PROMPT,
    Choosing,
    Pick,
    PickState,
    Reading,
    SavedPick,
    Scan,
    _states,
    claimable,
    count_scans,
)
from shelfscanner.web.sessions import should_touch

DEFAULT_TITLES = ["Dune", "The Left Hand of Darkness", "Piranesi", "Kindred", "Annihilation", "The Dispossessed",
                  "Solaris"]
DEFAULT_PICKS = [
    {"title": "Piranesi", "reason": "A short, strange house of a novel; you asked for atmosphere over plot."},
    {"title": "The Left Hand of Darkness", "reason": "Le Guin's ideas-first science fiction, which you rated highly."},
    {"title": "Kindred", "reason": "Time travel used for something serious; Butler is on your to-read list."},
    {"title": "Annihilation", "reason": "Weird, eerie and brief, in the vein of what you loved last year."},
    {"title": "Solaris", "reason": "Philosophical first contact, the classic behind books you already like."},
]

Clock = Callable[[], datetime]


def wall_clock() -> datetime:
    return datetime.now(UTC)


class FakeClient:
    """A ModelClient that answers with fixed JSON, or with an error, after an optional delay.

    `parsed` answers vision calls (the shelf), `picks` answers text calls (the choosing stage);
    `error` fails vision calls and `text_error` text calls. An error starting with `http ` fails
    over to the stage's fallback like a provider error would (002 D8), and fails there too.
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
    """Sessions in a dict. `last_seen` is written like the column would be: on `find`, at most once per
    `sessions.LAST_SEEN_THROTTLE_S` (008); `writes` counts those writes per session."""

    def __init__(self, clock: Clock = wall_clock) -> None:
        self.clock = clock
        self.rows: dict[str, int] = {}
        self.last_seen: dict[int, datetime] = {}
        self.writes: dict[int, int] = {}
        self._ids = count(1)

    def find(self, token_hash: str) -> int | None:
        session_id = self.rows.get(token_hash)
        if session_id is not None:
            now = self.clock()
            if should_touch(self.last_seen[session_id], now):
                self.last_seen[session_id] = now
                self.writes[session_id] = self.writes.get(session_id, 0) + 1
        return session_id

    def create(self, token_hash: str) -> int:
        session_id = next(self._ids)
        self.rows[token_hash] = session_id
        self.last_seen[session_id] = self.clock()
        return session_id


class FakePipeline:
    """Photos in a dict, readings and choosings from a FakeClient through the router, and the
    preferences, saved and feedback rows in lists shaped like their tables.

    `fail_store` makes the upload stage fail so the error path can be tested; `drop_all_titles`
    makes the catalogue check reject every title read, the way 007's verification can. `runs`
    holds one `{cost_usd, created_at}` per model call, the shape the daily cap sums; tests seed
    it to reach the cap.
    """

    def __init__(self, client: FakeClient | None = None, *, fail_store: str | None = None,
                 clock: Clock = wall_clock) -> None:
        self.client = client or FakeClient()
        self.fail_store = fail_store
        self.drop_all_titles = False
        self.clock = clock
        self.blobs: dict[str, bytes] = {}
        self.photos: dict[int, dict] = {}
        self.readings: dict[int, Reading] = {}
        self.choosings: dict[int, Choosing] = {}
        self.recommendations: dict[int, dict] = {}  # id -> {id, photo_id, session_id, parsed_recommendations, preferences, error}
        self.runs: list[dict] = []  # {cost_usd, created_at} per model call, like the runs tables
        self.prefs: dict[int, dict] = {}
        self.saved_rows: list[dict] = []
        self.feedback_rows: list[dict] = []
        self._ids = count(1)
        self._rec_ids = count(1)
        self._row_ids = count(1)

    # --- the scan -------------------------------------------------------------------------------

    def store(self, session_id: int, jpeg: bytes, *, resized_by_client: bool, client_hash: str | None = None) -> dict:
        if self.fail_store:
            raise RuntimeError(self.fail_store)
        photo_id = next(self._ids)
        storage_path = f"sessions/{session_id}/{photo_id}.jpg"
        self.blobs[storage_path] = jpeg
        now = self.clock()
        row = {"id": photo_id, "storage_path": storage_path, "titles": [], "partial_titles": [],
               "notes": None, "session_id": session_id, "created_at": now.isoformat(),
               "status": "pending", "status_at": now, "resized_by_client": resized_by_client,
               "client_hash": client_hash}
        self.photos[photo_id] = row
        return row

    def photo(self, photo_id: int, session_id: int) -> dict | None:
        row = self.photos.get(photo_id)
        return row if row and row["session_id"] == session_id else None

    def claim(self, photo_id: int, stage: str, now: datetime) -> bool:
        row = self.photos[photo_id]
        if not claimable(row["status"], row["status_at"], stage, now):
            return False
        row["status"], row["status_at"] = stage, now
        return True

    def set_status(self, photo_id: int, status: str, now: datetime) -> None:
        self.photos[photo_id]["status"], self.photos[photo_id]["status_at"] = status, now

    def _log_run(self, res: CallResult) -> None:
        self.runs.append({"cost_usd": res.cost_usd, "created_at": self.clock().isoformat()})

    def read(self, photo: dict, on_progress: Progress) -> Reading:
        blob = self.blobs[photo["storage_path"]]
        sr = router.with_failover("reading", None,
                                  lambda m: router.vision(m, "fake prompt", blob, client=self.client, on_progress=on_progress),
                                  on_progress=on_progress)
        self._log_run(sr.result)
        attempts = {"model": sr.model.slug, "failover_from": sr.failover_from, "failover_error": sr.failover_error}
        reading = (Reading(titles=titles_from(sr.result.parsed), extraction_id=photo["id"], **attempts) if sr.result.ok
                   else Reading(error=sr.result.error, extraction_id=photo["id"], **attempts))
        self.readings[photo["id"]] = reading
        return reading

    def choose(self, photo: dict, reading: Reading, prefs: dict, on_progress: Progress) -> Choosing:
        on_progress(CHECKING_NOTE)  # the real pipeline checks the titles against the catalogue first (007)
        if self.drop_all_titles:
            choosing = Choosing(error=f"none of the {len(reading.titles)} titles read matched a catalogue record",
                                step="checking", verbatim=True)
            self.choosings[photo["id"]] = choosing
            return choosing
        shelf = {"books": [{"title": t} for t in reading.titles]}
        text = f"Books on the shelf:\n{shelf_text(shelf)}\n\nReading preferences:\n{prefs_text(prefs, CHOOSING_PROMPT)}"
        sr = router.with_failover("choosing", None,
                                  lambda m: router.text(m, "fake prompt", text, client=self.client, on_progress=on_progress,
                                                        schema=RECOMMENDATIONS_SCHEMA),
                                  on_progress=on_progress)
        res = sr.result
        self._log_run(res)
        rec_id = next(self._rec_ids)
        self.recommendations[rec_id] = {"id": rec_id, "photo_id": photo["id"], "session_id": photo["session_id"],
                                        "parsed_recommendations": res.parsed if res.ok else None,
                                        "preferences": prefs, "error": res.error, "model": sr.model.slug,
                                        "failover_from": sr.failover_from, "failover_error": sr.failover_error}
        attempts = {"model": sr.model.slug, "failover_from": sr.failover_from, "failover_error": sr.failover_error}
        if res.ok:
            choosing = Choosing(picks=[Pick(r.title, r.reason, r.author, r.cover_id) for r in recs_from(res.parsed)], recommendation_id=rec_id,
                                **attempts)
        else:
            choosing = Choosing(error=res.error, recommendation_id=rec_id, **attempts)
        self.choosings[photo["id"]] = choosing
        return choosing

    def result(self, photo_id: int) -> Scan | None:
        reading = self.readings.get(photo_id)
        return Scan(reading, self.choosings.get(photo_id)) if reading else None

    # --- limits (008) ---------------------------------------------------------------------------

    def scan_counts(self, session_id: int, client_hash: str | None, since: datetime) -> tuple[int, int]:
        rows = [p for p in self.photos.values() if datetime.fromisoformat(p["created_at"]) >= since]
        return count_scans(rows, session_id, client_hash)

    def spent_since(self, since: datetime) -> float:
        return sum(float(r["cost_usd"]) for r in self.runs
                   if r.get("cost_usd") is not None and datetime.fromisoformat(r["created_at"]) >= since)

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
        return [Pick(r.title, r.reason, r.author, r.cover_id) for r in recs_from(rec["parsed_recommendations"])]

    def _rows(self, rows: list[dict], session_id: int, recommendation_id: int) -> list[dict]:
        return [r for r in rows if r["session_id"] == session_id and r["recommendation_id"] == recommendation_id]

    def pick_states(self, session_id: int, recommendation_id: int) -> dict[int, PickState]:
        return _states(self._rows(self.saved_rows, session_id, recommendation_id),
                       self._rows(self.feedback_rows, session_id, recommendation_id))

    def save(self, session_id: int, recommendation_id: int, pick_index: int) -> None:
        if any(r["pick_index"] == pick_index and r["removed_at"] is None
               for r in self._rows(self.saved_rows, session_id, recommendation_id)):
            return  # idempotent (017), as the real pipeline
        self.saved_rows.append({"id": next(self._row_ids), "session_id": session_id, "recommendation_id": recommendation_id,
                                "pick_index": pick_index, "created_at": self.clock().isoformat(), "removed_at": None})

    def unsave(self, session_id: int, recommendation_id: int, pick_index: int) -> None:
        for r in self._rows(self.saved_rows, session_id, recommendation_id):
            if r["pick_index"] == pick_index and r["removed_at"] is None:
                r["removed_at"] = self.clock().isoformat()

    def mark(self, session_id: int, recommendation_id: int, pick_index: int, kind: str) -> None:
        if any(r["pick_index"] == pick_index and r["kind"] == kind
               for r in self._rows(self.feedback_rows, session_id, recommendation_id)):
            return
        self.feedback_rows.append({"id": next(self._row_ids), "session_id": session_id,
                                   "recommendation_id": recommendation_id, "pick_index": pick_index, "kind": kind,
                                   "created_at": self.clock().isoformat()})

    def saved(self, session_id: int) -> list[SavedPick]:
        out = []
        for r in sorted(self.saved_rows, key=lambda r: r["id"], reverse=True):
            if r["session_id"] != session_id or r["removed_at"] is not None:
                continue
            rec = self.recommendations[r["recommendation_id"]]
            pick = recs_from(rec["parsed_recommendations"])[r["pick_index"]]
            out.append(SavedPick(r["recommendation_id"], r["pick_index"], pick.title, pick.reason, r["created_at"],
                                 self.photos[rec["photo_id"]]["created_at"], pick.author, pick.cover_id))
        return out
