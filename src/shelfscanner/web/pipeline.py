"""The boundary between the web layer and the pipeline (003, extended by 005 and 008).

The routes only ever call the methods of `Pipeline`. `SupabasePipeline` is the
real thing: the bucket, the `photos`, `extractions` and `recommendations` tables,
the `preferences`, `saved` and `feedback` tables, and the router.
`fakes.FakePipeline` implements the same protocol in memory for tests and for
running the server without any credentials.

A scan is two stages, reading (extraction) and choosing (recommendation, which
checks the titles against the catalogue first). The web layer runs them one
after the other from `scan.py`; the pipeline logs each exactly as the CLI would.
The `photos.status` column is the lock on the stages (008): a connection claims
a stage before running it, and a claim older than `STALE_CLAIM_S` may be taken
over.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Protocol

from shelfscanner import extract, preferences, recommend, router, spend, storage
from shelfscanner.config import load_config
from shelfscanner.router import ModelClient, Progress

CHOOSING_PROMPT = "recommend_v2"  # the web builds structured preferences, which v2 explains to the model
NOT_FOR_ME = "not_for_me"

# 005 D2: a scan with no preferences still runs; the model is told the taste is unknown. The note
# rides in `free_text` so the logged `preferences` column is exactly what the model was given.
UNKNOWN_TASTE = ("No preferences were given, so the reader's taste is unknown. Pick five varied, well-regarded "
                 "books from the shelf and, for each, say what kind of reader it suits and why.")

# --- change 008: the scan's status doubles as the stage lock -----------------------------------
STATUSES = ("pending", "reading", "choosing", "done", "failed")
STALE_CLAIM_S = 180  # a reading or choosing claim this old belongs to a dead connection


def failure_text(error: str | None, failover_from: str | None, failover_error: str | None,
                 model: str | None) -> str | None:
    """The error a failed stage shows. After a failover both attempts are named, so the page never
    shows one failure when there were two (008)."""
    if error is None:
        return None
    if failover_from and failover_error:
        return (f"Both models failed. {failover_from}: {failover_error}. "
                f"Then {model or 'the fallback'}: {error}.")
    return error


@dataclass(frozen=True)
class Reading:
    """What the reading stage produced for a photo: titles, or the error that stopped it."""

    titles: list[str] = field(default_factory=list)
    error: str | None = None
    extraction_id: int | None = None
    model: str | None = None
    failover_from: str | None = None  # the primary's slug when the fallback answered (002 D8)
    failover_error: str | None = None

    @property
    def ok(self) -> bool:
        return self.error is None

    @property
    def message(self) -> str | None:
        return failure_text(self.error, self.failover_from, self.failover_error, self.model)


@dataclass(frozen=True)
class Pick:
    title: str
    reason: str


@dataclass(frozen=True)
class Choosing:
    """What the choosing stage produced: the picks and the recommendation row they live in, or the error.

    `step` names the part that failed: `checking` when the catalogue check dropped every title read
    (007), `choosing` for the model call itself.
    """

    picks: list[Pick] = field(default_factory=list)
    error: str | None = None
    recommendation_id: int | None = None
    step: str = "choosing"
    model: str | None = None
    failover_from: str | None = None
    failover_error: str | None = None

    @property
    def ok(self) -> bool:
        return self.error is None

    @property
    def message(self) -> str | None:
        return failure_text(self.error, self.failover_from, self.failover_error, self.model)


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
        """`reading`, `checking` or `choosing`; None while nothing has failed."""
        if not self.reading.ok:
            return "reading"
        if self.choosing is not None and not self.choosing.ok:
            return self.choosing.step
        return None

    @property
    def error(self) -> str | None:
        if not self.reading.ok:
            return self.reading.message
        return self.choosing.message if self.choosing else None

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

    def store(self, session_id: int, jpeg: bytes, *, resized_by_client: bool) -> dict:
        """Persist stripped JPEG bytes for a session; return the `photos` row (status `pending`)."""
        ...

    def photo(self, photo_id: int, session_id: int) -> dict | None:
        """The photo row when it belongs to the session, else None."""
        ...

    def claim(self, photo_id: int, stage: str, now: datetime) -> bool:
        """Take the lock for `reading` or `choosing`: set `status` to the stage and `status_at` to
        `now`, atomically, when the scan is not already there. A `reading` is claimable from
        `pending` or a stale `reading`; a `choosing` from `pending`, `reading` (the reading finished
        or is stale) or a stale `choosing`. False when another connection holds a fresh claim."""
        ...

    def set_status(self, photo_id: int, status: str, now: datetime) -> None: ...

    def read(self, photo: dict, on_progress: Progress) -> Reading:
        """Run the reading stage over a stored photo, logging its row as the CLI would."""
        ...

    def choose(self, photo: dict, reading: Reading, prefs: dict, on_progress: Progress) -> Choosing:
        """Run the choosing stage over a successful reading with the preferences as given."""
        ...

    def result(self, photo_id: int) -> Scan | None:
        """The latest reading of a photo with its latest choosing, or None when no reading has run."""
        ...

    # --- limits (008) ---------------------------------------------------------------------------

    def scan_count(self, session_id: int, since: datetime) -> int:
        """Photos the session stored at or after `since`."""
        ...

    def spent_since(self, since: datetime) -> float:
        """`cost_usd` summed over both runs tables for rows created at or after `since`."""
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


def claimable(status: str | None, status_at: datetime | None, stage: str, now: datetime) -> bool:
    """The claim rule of `Pipeline.claim`, over the row's values. Shared by the fake and the tests;
    the real pipeline sends the same rule to the server as a filter."""
    stale = status_at is None or status_at <= now - timedelta(seconds=STALE_CLAIM_S)
    if status in (None, "pending"):
        return True
    if stage == "reading":
        return status == "reading" and stale
    return status == "reading" or (status == "choosing" and stale)


def _stamp(now: datetime) -> str:
    """An ISO timestamp PostgREST accepts inside an `or=` filter: UTC, whole seconds, no `+`."""
    return now.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


class SupabasePipeline:
    def __init__(self, client: ModelClient | None = None) -> None:
        self.client = client  # None means the router picks the adapter from config

    def _db(self):
        from shelfscanner.db import get_client

        return get_client()

    # --- the scan -------------------------------------------------------------------------------

    def store(self, session_id: int, jpeg: bytes, *, resized_by_client: bool) -> dict:
        return storage.store_session_photo(session_id, jpeg, status="pending", resized_by_client=resized_by_client)

    def photo(self, photo_id: int, session_id: int) -> dict | None:
        return storage.get_session_photo(photo_id, session_id)

    def claim(self, photo_id: int, stage: str, now: datetime) -> bool:
        # One UPDATE with the claim rule as its filter, so two connections cannot both succeed.
        stale = _stamp(now - timedelta(seconds=STALE_CLAIM_S))
        if stage == "reading":
            rule = f'status.eq.pending,and(status.eq.reading,status_at.lte."{stale}")'
        else:
            rule = f'status.in.(pending,reading),and(status.eq.choosing,status_at.lte."{stale}")'
        res = (self._db().table("photos").update({"status": stage, "status_at": now.isoformat()})
               .eq("id", photo_id).or_(rule).execute())
        return bool(res.data)

    def set_status(self, photo_id: int, status: str, now: datetime) -> None:
        self._db().table("photos").update({"status": status, "status_at": now.isoformat()}).eq("id", photo_id).execute()

    def read(self, photo: dict, on_progress: Progress) -> Reading:
        cfg = load_config()
        row = extract.extract_photo(photo, router.primary("reading"), cfg.default_max_edge, extract.DEFAULT_PROMPT,
                                    client=self.client, on_progress=on_progress)
        ex = extract.get_extraction(row.id)
        attempts = {"model": ex.get("model"), "failover_from": ex.get("failover_from"),
                    "failover_error": ex.get("failover_error")}
        if row.error:
            return Reading(error=row.error, extraction_id=row.id, **attempts)
        return Reading(titles=extract.titles_from(ex["parsed_titles"]), extraction_id=row.id, **attempts)

    def choose(self, photo: dict, reading: Reading, prefs: dict, on_progress: Progress) -> Choosing:
        assert reading.extraction_id is not None
        extraction = extract.get_extraction(reading.extraction_id)
        # --- change 007: verify the read titles against the catalogue before choosing (L1). A catalogue
        # outage keeps every title, unverified (007 D2); every title dropped is a failed step, not a crash.
        from shelfscanner import verify

        verified = verify.verify_extraction(extraction, on_progress=on_progress)
        if not verified.kept:
            return Choosing(error=f"none of the {len(verified.dropped)} titles read matched a catalogue record",
                            step="checking")
        try:
            row = recommend.recommend_from_extraction(extraction, None, prefs, CHOOSING_PROMPT, client=self.client,
                                                      on_progress=on_progress, verified=verified)
        except SystemExit as e:  # the CLI-shaped failure for an empty list; the page names the stage instead
            return Choosing(error=str(e))
        rec = (self._db().table("recommendations").select("model, failover_from, failover_error")
               .eq("id", row.id).execute().data)
        attempts = ({"model": rec[0]["model"], "failover_from": rec[0]["failover_from"],
                     "failover_error": rec[0]["failover_error"]} if rec else {})
        if row.error:
            return Choosing(error=row.error, recommendation_id=row.id, **attempts)
        return Choosing(picks=[Pick(r.title, r.reason) for r in row.recs], recommendation_id=row.id, **attempts)

    def result(self, photo_id: int) -> Scan | None:
        res = (self._db().table("extractions").select("id, parsed_titles, error, model, failover_from, failover_error")
               .eq("photo_id", photo_id).order("id", desc=True).limit(1).execute())
        if not res.data:
            return None
        ex = res.data[0]
        attempts = {"model": ex["model"], "failover_from": ex["failover_from"], "failover_error": ex["failover_error"]}
        if ex["error"]:
            return Scan(Reading(error=ex["error"], extraction_id=ex["id"], **attempts))
        reading = Reading(titles=extract.titles_from(ex["parsed_titles"]), extraction_id=ex["id"], **attempts)
        res = (self._db().table("recommendations")
               .select("id, parsed_recommendations, error, model, failover_from, failover_error")
               .eq("extraction_id", ex["id"]).order("id", desc=True).limit(1).execute())
        if not res.data:
            return Scan(reading)
        rec = res.data[0]
        attempts = {"model": rec["model"], "failover_from": rec["failover_from"], "failover_error": rec["failover_error"]}
        if rec["error"]:
            return Scan(reading, Choosing(error=rec["error"], recommendation_id=rec["id"], **attempts))
        picks = [Pick(r.title, r.reason) for r in recommend.recs_from(rec["parsed_recommendations"])]
        return Scan(reading, Choosing(picks=picks, recommendation_id=rec["id"], **attempts))

    # --- limits (008) ---------------------------------------------------------------------------

    def scan_count(self, session_id: int, since: datetime) -> int:
        res = (self._db().table("photos").select("id", count="exact").eq("session_id", session_id)
               .gte("created_at", since.isoformat()).execute())
        return res.count if res.count is not None else len(res.data)

    def spent_since(self, since: datetime) -> float:
        return spend.spent_since(self._db(), since)

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
    return datetime.now(UTC).isoformat()
