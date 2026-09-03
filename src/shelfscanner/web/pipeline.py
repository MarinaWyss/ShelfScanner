"""The boundary between the web layer and the pipeline (003, extended by 005).

The routes only ever call the methods of `Pipeline`. `SupabasePipeline` is the
real thing: the bucket, the `photos`, `extractions` and `recommendations` tables,
the `preferences`, `saved` and `feedback` tables, and the router.
`fakes.FakePipeline` implements the same protocol in memory for tests and for
running the server without any credentials.

A scan is two stages, reading (extraction) and choosing (recommendation). The
web layer runs them one after the other from `scan.py`; the pipeline logs each
exactly as the CLI would.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol

from shelfscanner import extract, preferences, recommend, router, storage
from shelfscanner.config import load_config
from shelfscanner.router import ModelClient, Progress

CHOOSING_PROMPT = "recommend_v2"  # the web builds structured preferences, which v2 explains to the model
NOT_FOR_ME = "not_for_me"

# 005 D2: a scan with no preferences still runs; the model is told the taste is unknown. The note
# rides in `free_text` so the logged `preferences` column is exactly what the model was given.
UNKNOWN_TASTE = ("No preferences were given, so the reader's taste is unknown. Pick five varied, well-regarded "
                 "books from the shelf and, for each, say what kind of reader it suits and why.")


@dataclass(frozen=True)
class Reading:
    """What the reading stage produced for a photo: titles, or the error that stopped it."""

    titles: list[str] = field(default_factory=list)
    error: str | None = None
    extraction_id: int | None = None

    @property
    def ok(self) -> bool:
        return self.error is None


@dataclass(frozen=True)
class Pick:
    title: str
    reason: str


@dataclass(frozen=True)
class Choosing:
    """What the choosing stage produced: the picks and the recommendation row they live in, or the error."""

    picks: list[Pick] = field(default_factory=list)
    error: str | None = None
    recommendation_id: int | None = None

    @property
    def ok(self) -> bool:
        return self.error is None


@dataclass(frozen=True)
class Scan:
    """The state of one scan: its reading and, once it has run, its choosing.

    `choosing` is None while the choosing stage has not run yet; it never runs when reading failed
    or read no titles, and the scan is complete then.
    """

    reading: Reading
    choosing: Choosing | None = None

    @property
    def complete(self) -> bool:
        return not self.reading.ok or not self.reading.titles or self.choosing is not None

    @property
    def failed_stage(self) -> str | None:
        if not self.reading.ok:
            return "reading"
        if self.choosing is not None and not self.choosing.ok:
            return "choosing"
        return None

    @property
    def error(self) -> str | None:
        if not self.reading.ok:
            return self.reading.error
        return self.choosing.error if self.choosing else None

    @property
    def picks(self) -> list[Pick]:
        return self.choosing.picks if self.choosing and self.choosing.ok else []

    @property
    def recommendation_id(self) -> int | None:
        return self.choosing.recommendation_id if self.choosing else None


@dataclass(frozen=True)
class PickState:
    saved: bool = False
    not_for_me: bool = False


@dataclass(frozen=True)
class SavedPick:
    recommendation_id: int
    pick_index: int
    title: str
    reason: str
    saved_at: str  # ISO timestamps as the database gives them
    scanned_at: str


def prefs_for_scan(prefs: dict | None) -> dict:
    """The preferences object a scan sends: the session's, or the taste-unknown note when there is
    nothing in it (005 D2)."""
    obj = preferences.upgrade(prefs) if prefs else preferences.empty()
    if any(obj[k] for k in preferences.KEYS):
        return obj
    return {**obj, "free_text": UNKNOWN_TASTE}


class Pipeline(Protocol):
    # --- the scan -------------------------------------------------------------------------------

    def store(self, session_id: int, jpeg: bytes) -> dict:
        """Persist stripped JPEG bytes for a session; return the `photos` row."""
        ...

    def photo(self, photo_id: int, session_id: int) -> dict | None:
        """The photo row when it belongs to the session, else None."""
        ...

    def read(self, photo: dict, on_progress: Progress) -> Reading:
        """Run the reading stage over a stored photo, logging its row as the CLI would."""
        ...

    def choose(self, photo: dict, reading: Reading, prefs: dict, on_progress: Progress) -> Choosing:
        """Run the choosing stage over a successful reading with the preferences as given."""
        ...

    def result(self, photo_id: int) -> Scan | None:
        """The latest reading of a photo with its latest choosing, or None when no reading has run."""
        ...

    # --- preferences ----------------------------------------------------------------------------

    def preferences(self, session_id: int) -> dict | None:
        """The session's stored preferences object, or None when the page was never submitted."""
        ...

    def save_preferences(self, session_id: int, prefs: dict) -> None: ...

    # --- save and feedback ----------------------------------------------------------------------

    def recommendation(self, recommendation_id: int, session_id: int) -> list[Pick] | None:
        """The picks of a recommendation row when it belongs to the session, else None."""
        ...

    def pick_states(self, session_id: int, recommendation_id: int) -> dict[int, PickState]:
        """Per pick index, whether it is currently saved and whether it was marked not for me."""
        ...

    def save(self, session_id: int, recommendation_id: int, pick_index: int) -> None: ...

    def unsave(self, session_id: int, recommendation_id: int, pick_index: int) -> None: ...

    def mark(self, session_id: int, recommendation_id: int, pick_index: int, kind: str) -> None: ...

    def saved(self, session_id: int) -> list[SavedPick]:
        """The session's live saves, newest first."""
        ...


def _states(saved_rows: list[dict], feedback_rows: list[dict]) -> dict[int, PickState]:
    live = {r["pick_index"] for r in saved_rows if r.get("removed_at") is None}
    marked = {r["pick_index"] for r in feedback_rows if r["kind"] == NOT_FOR_ME}
    return {i: PickState(saved=i in live, not_for_me=i in marked) for i in live | marked}


class SupabasePipeline:
    def __init__(self, client: ModelClient | None = None) -> None:
        self.client = client  # None means the router picks the adapter from config

    def _db(self):
        from shelfscanner.db import get_client

        return get_client()

    # --- the scan -------------------------------------------------------------------------------

    def store(self, session_id: int, jpeg: bytes) -> dict:
        return storage.store_session_photo(session_id, jpeg)

    def photo(self, photo_id: int, session_id: int) -> dict | None:
        return storage.get_session_photo(photo_id, session_id)

    def read(self, photo: dict, on_progress: Progress) -> Reading:
        cfg = load_config()
        row = extract.extract_photo(photo, router.primary("reading"), cfg.default_max_edge, extract.DEFAULT_PROMPT,
                                    client=self.client, on_progress=on_progress)
        if row.error:
            return Reading(error=row.error, extraction_id=row.id)
        return Reading(titles=extract.titles_from(extract.get_extraction(row.id)["parsed_titles"]), extraction_id=row.id)

    def choose(self, photo: dict, reading: Reading, prefs: dict, on_progress: Progress) -> Choosing:
        assert reading.extraction_id is not None
        extraction = extract.get_extraction(reading.extraction_id)
        # --- change 007: verify the read titles against the catalogue before choosing (L1). A catalogue
        # outage keeps every title, unverified (007 D2); every title dropped is a failed stage, not a crash.
        from shelfscanner import verify

        verified = verify.verify_extraction(extraction, on_progress=on_progress)
        if not verified.kept:
            return Choosing(error=f"none of the {len(verified.dropped)} titles read matched a catalogue record")
        try:
            row = recommend.recommend_from_extraction(extraction, None, prefs, CHOOSING_PROMPT, client=self.client,
                                                      on_progress=on_progress, verified=verified)
        except SystemExit as e:  # the CLI-shaped failure for an empty list; the page names the stage instead
            return Choosing(error=str(e))
        if row.error:
            return Choosing(error=row.error, recommendation_id=row.id)
        return Choosing(picks=[Pick(r.title, r.reason) for r in row.recs], recommendation_id=row.id)

    def result(self, photo_id: int) -> Scan | None:
        res = (self._db().table("extractions").select("id, parsed_titles, error").eq("photo_id", photo_id)
               .order("id", desc=True).limit(1).execute())
        if not res.data:
            return None
        ex = res.data[0]
        if ex["error"]:
            return Scan(Reading(error=ex["error"], extraction_id=ex["id"]))
        reading = Reading(titles=extract.titles_from(ex["parsed_titles"]), extraction_id=ex["id"])
        res = (self._db().table("recommendations").select("id, parsed_recommendations, error")
               .eq("extraction_id", ex["id"]).order("id", desc=True).limit(1).execute())
        if not res.data:
            return Scan(reading)
        rec = res.data[0]
        if rec["error"]:
            return Scan(reading, Choosing(error=rec["error"], recommendation_id=rec["id"]))
        picks = [Pick(r.title, r.reason) for r in recommend.recs_from(rec["parsed_recommendations"])]
        return Scan(reading, Choosing(picks=picks, recommendation_id=rec["id"]))

    # --- preferences ----------------------------------------------------------------------------

    def preferences(self, session_id: int) -> dict | None:
        res = self._db().table("preferences").select("object").eq("session_id", session_id).execute()
        return res.data[0]["object"] if res.data else None

    def save_preferences(self, session_id: int, prefs: dict) -> None:
        preferences.save_for_session(session_id, prefs)

    # --- save and feedback ----------------------------------------------------------------------

    def recommendation(self, recommendation_id: int, session_id: int) -> list[Pick] | None:
        res = (self._db().table("recommendations")
               .select("id, parsed_recommendations, error, extractions!inner(photos!inner(session_id))")
               .eq("id", recommendation_id).eq("extractions.photos.session_id", session_id).execute())
        if not res.data or res.data[0]["error"]:
            return None
        return [Pick(r.title, r.reason) for r in recommend.recs_from(res.data[0]["parsed_recommendations"])]

    def pick_states(self, session_id: int, recommendation_id: int) -> dict[int, PickState]:
        db = self._db()
        saved_rows = (db.table("saved").select("pick_index, removed_at").eq("session_id", session_id)
                      .eq("recommendation_id", recommendation_id).execute().data)
        feedback_rows = (db.table("feedback").select("pick_index, kind").eq("session_id", session_id)
                         .eq("recommendation_id", recommendation_id).execute().data)
        return _states(saved_rows, feedback_rows)

    def save(self, session_id: int, recommendation_id: int, pick_index: int) -> None:
        self._db().table("saved").insert({"session_id": session_id, "recommendation_id": recommendation_id,
                                          "pick_index": pick_index}).execute()

    def unsave(self, session_id: int, recommendation_id: int, pick_index: int) -> None:
        # Stamp every live row for the pick (normally one) so the state is unambiguous afterwards.
        (self._db().table("saved").update({"removed_at": _now()}).eq("session_id", session_id)
         .eq("recommendation_id", recommendation_id).eq("pick_index", pick_index).is_("removed_at", "null").execute())

    def mark(self, session_id: int, recommendation_id: int, pick_index: int, kind: str) -> None:
        self._db().table("feedback").insert({"session_id": session_id, "recommendation_id": recommendation_id,
                                             "pick_index": pick_index, "kind": kind}).execute()

    def saved(self, session_id: int) -> list[SavedPick]:
        rows = (self._db().table("saved")
                .select("recommendation_id, pick_index, created_at, "
                        "recommendations(parsed_recommendations, extractions(photos(created_at)))")
                .eq("session_id", session_id).is_("removed_at", "null").order("created_at", desc=True).execute().data)
        out = []
        for r in rows:
            rec = r["recommendations"]
            picks = recommend.recs_from(rec["parsed_recommendations"])
            if r["pick_index"] >= len(picks):
                continue
            pick = picks[r["pick_index"]]
            out.append(SavedPick(r["recommendation_id"], r["pick_index"], pick.title, pick.reason, r["created_at"],
                                 rec["extractions"]["photos"]["created_at"]))
        return out


def _now() -> str:
    from datetime import UTC, datetime

    return datetime.now(UTC).isoformat()
