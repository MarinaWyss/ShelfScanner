"""The metrics over the rows: the feedback rate from 005 and the shared aggregation from 009.

Everything but `fetch`, `save_rate` and `source_for` is pure over lists of dicts
shaped like the tables, so the dashboard and the report are tested on seeded
rows and on the fake pipeline's rows. One set of numbers (009 D1): `research.report`
and `/admin` both come here for what they show in common.

Vocabulary, so the page and the report say the same thing:

- A *scan started* is a `photos` row; a scan belongs to the UTC day its photo
  was stored, and so do every row joined to it (its extractions, lookups,
  recommendations, saves and marks), whenever those were written.
- A *scan with picks* is a recommendation row without an error: one that put
  picks on a screen. That is the denominator of the save rate (005).
- A scan is *complete* when it has a recommendation row without an error.
- *App scans* are photos with a session; *labelled photos* are the test sets.
  A window is a whole number of UTC days ending today, or all time.
"""

from __future__ import annotations

import math
from collections import Counter
from collections.abc import Callable, Iterable
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta
from statistics import mean

from shelfscanner.recommend import recs_from
from shelfscanner.web.pipeline import NOT_FOR_ME

WINDOWS: dict[str, int | None] = {"7": 7, "30": 30, "all": None}
DEFAULT_WINDOW = "7"
STAGES = ("reading", "checking", "choosing")
PRICE_STALE_DAYS = 90  # 002 D5
CACHE_COLUMN = "cache_hits"  # on `lookups`, once 008's caching lands; absent means "not recorded"
PAGE = 1000  # PostgREST's default max rows per request


# --- 005: the feedback rate ---------------------------------------------------------------------


@dataclass(frozen=True)
class SaveRate:
    scans: int  # recommendation rows that produced picks
    picks: int  # picks across those rows
    saves: int  # picks currently saved (a live `saved` row)
    not_for_me: int  # picks marked not for me, counted once per pick

    @property
    def saves_per_scan(self) -> float | None:
        return self.saves / self.scans if self.scans else None

    @property
    def not_for_me_per_pick(self) -> float | None:
        return self.not_for_me / self.picks if self.picks else None

    def line(self) -> str:
        per_scan = f"{self.saves_per_scan:.2f}" if self.saves_per_scan is not None else "-"
        per_pick = f"{self.not_for_me_per_pick:.2f}" if self.not_for_me_per_pick is not None else "-"
        return (f"save rate {per_scan} per scan ({self.saves} saves / {self.scans} scans); "
                f"not for me {per_pick} per pick ({self.not_for_me} / {self.picks} picks)")


def compute(recommendations: list[dict], saved: list[dict], feedback: list[dict]) -> SaveRate:
    """`recommendations` rows carry `id`, `parsed_recommendations`, `error`; `saved` rows
    `recommendation_id`, `pick_index`, `removed_at`; `feedback` rows `recommendation_id`, `pick_index`,
    `kind`. Rows for recommendations outside the first list are ignored."""
    scans = {r["id"]: len(recs_from(r["parsed_recommendations"])) for r in recommendations if not r.get("error")}
    saves = {(s["recommendation_id"], s["pick_index"]) for s in saved
             if s["recommendation_id"] in scans and s.get("removed_at") is None}
    marks = {(f["recommendation_id"], f["pick_index"]) for f in feedback
             if f["recommendation_id"] in scans and f["kind"] == NOT_FOR_ME}
    return SaveRate(scans=len(scans), picks=sum(scans.values()), saves=len(saves), not_for_me=len(marks))


def save_rate(session_id: int | None = None) -> SaveRate:
    """Over every session's scans, or one session's."""
    from shelfscanner.db import get_client

    c = get_client()
    recs = c.table("recommendations").select("id, parsed_recommendations, error, extractions!inner(photos!inner(session_id))")
    saved = c.table("saved").select("recommendation_id, pick_index, removed_at")
    feedback = c.table("feedback").select("recommendation_id, pick_index, kind")
    if session_id is not None:
        recs = recs.eq("extractions.photos.session_id", session_id)
        saved = saved.eq("session_id", session_id)
        feedback = feedback.eq("session_id", session_id)
    else:
        recs = recs.not_.is_("extractions.photos.session_id", "null")  # test-set runs are not scans
    return compute(recs.execute().data, saved.execute().data, feedback.execute().data)


# --- 009: the rows and the windows --------------------------------------------------------------


@dataclass(frozen=True)
class Rows:
    """The six tables, or the part of them the window needs. Every list is joined to `photos`:
    extractions and lookups by `photo_id`, recommendations through their extraction, saves and
    marks through their recommendation. `restrict` keeps the join closed."""

    photos: list[dict] = field(default_factory=list)  # id, session_id, titles, created_at
    extractions: list[dict] = field(default_factory=list)  # id, photo_id, error, latency_ms, cost_usd, failover_from
    recommendations: list[dict] = field(default_factory=list)  # id, extraction_id, error, latency_ms, cost_usd, ...
    lookups: list[dict] = field(default_factory=list)  # id, photo_id, hits, misses, errors, latency_ms[, cache_hits]
    saved: list[dict] = field(default_factory=list)  # recommendation_id, pick_index, removed_at
    feedback: list[dict] = field(default_factory=list)  # recommendation_id, pick_index, kind

    def restrict(self, photos: Iterable[dict]) -> Rows:
        """The rows joined to these photos and nothing else."""
        photos = list(photos)
        photo_ids = {p["id"] for p in photos}
        extractions = [e for e in self.extractions if e["photo_id"] in photo_ids]
        extraction_ids = {e["id"] for e in extractions}
        recommendations = [r for r in self.recommendations if r["extraction_id"] in extraction_ids]
        rec_ids = {r["id"] for r in recommendations}
        return Rows(photos=photos, extractions=extractions, recommendations=recommendations,
                    lookups=[lk for lk in self.lookups if lk["photo_id"] in photo_ids],
                    saved=[s for s in self.saved if s["recommendation_id"] in rec_ids],
                    feedback=[f for f in self.feedback if f["recommendation_id"] in rec_ids])

    def since(self, start: datetime | None) -> Rows:
        if start is None:
            return self
        return self.restrict(p for p in self.photos if parse_ts(p["created_at"]) >= start)

    def app(self) -> Rows:
        """Scans from the app: photos with a session (003)."""
        return self.restrict(p for p in self.photos if p.get("session_id") is not None)

    def labelled(self) -> Rows:
        """The test sets: photos with ground-truth titles (the report's own filter)."""
        return self.restrict(p for p in self.photos if p.get("titles"))


def parse_ts(value: str | datetime) -> datetime:
    """Timestamps as Supabase returns them (`2026-09-03T12:00:00.123+00:00`, or `Z`), as aware UTC."""
    if isinstance(value, datetime):
        dt = value
    else:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return dt.astimezone(UTC) if dt.tzinfo else dt.replace(tzinfo=UTC)


def window_bounds(window: str, now: datetime | None = None) -> tuple[datetime | None, datetime]:
    """`(start, end)` for a window key: `start` is midnight UTC `days - 1` days before `end`'s date, so
    the seven-day window is today and the six days before it; `None` for all time."""
    if window not in WINDOWS:
        raise ValueError(f"unknown window {window!r}; one of {', '.join(WINDOWS)}")
    end = now or datetime.now(UTC)
    days = WINDOWS[window]
    if days is None:
        return None, end
    start = datetime.combine(end.date() - timedelta(days=days - 1), datetime.min.time(), tzinfo=UTC)
    return start, end


# --- 009: the aggregation -----------------------------------------------------------------------


def percentile(values: Iterable[float | None], p: float) -> float | None:
    """Linear interpolation between order statistics (numpy's default), so `percentile(v, 50)` is
    exactly `statistics.median(v)`, which is what the report prints as p50."""
    vs = sorted(v for v in values if v is not None)
    if not vs:
        return None
    k = (len(vs) - 1) * p / 100
    lo, hi = math.floor(k), math.ceil(k)
    return vs[lo] + (vs[hi] - vs[lo]) * (k - lo)


def _mean(values: Iterable[float | None]) -> float | None:
    vs = [v for v in values if v is not None]
    return mean(vs) if vs else None


def _cost(row: dict) -> float:
    return float(row.get("cost_usd") or 0)


@dataclass(frozen=True)
class StageStats:
    stage: str
    rows: int  # rows without error; latency and cost are over these, as in the report
    errors: int  # model rows with `error`; for checking, lookups rows where the catalogue failed at all
    p50_ms: float | None
    p95_ms: float | None
    cost_per_scan: float | None  # mean cost_usd over rows without error, as the report's mean_cost_usd
    spend_usd: float  # every row's cost, errors included: what the spend guard sees
    failovers: int  # rows answered by the fallback (002 D8)


def stage_stats(stage: str, rows: list[dict]) -> StageStats:
    """Model stages take extraction or recommendation rows; `checking` takes lookups rows, whose
    `errors` column counts titles the catalogue failed for and which carry no cost."""
    if stage == "checking":
        return StageStats(stage=stage, rows=len(rows), errors=sum(1 for r in rows if r.get("errors")),
                          p50_ms=percentile((r.get("latency_ms") for r in rows), 50),
                          p95_ms=percentile((r.get("latency_ms") for r in rows), 95),
                          cost_per_scan=None, spend_usd=0.0, failovers=0)
    ok = [r for r in rows if not r.get("error")]
    return StageStats(stage=stage, rows=len(ok), errors=len(rows) - len(ok),
                      p50_ms=percentile((r.get("latency_ms") for r in ok), 50),
                      p95_ms=percentile((r.get("latency_ms") for r in ok), 95),
                      cost_per_scan=_mean(r.get("cost_usd") for r in ok),
                      spend_usd=sum(_cost(r) for r in rows),
                      failovers=sum(1 for r in rows if r.get("failover_from")))


@dataclass(frozen=True)
class Errors:
    """The split the scoping doc asks for: a model failure is a row with `error` (the call ran and
    the reply was unusable); an application failure is a photo with no extraction row at all (the
    scan never reached a model: upload, storage, a crash). A scan still in flight shows as an
    application failure until its row lands, which at weekly volume is noise."""

    model_rows: int
    model_failures: int
    scans: int
    application_failures: int

    @property
    def model_rate(self) -> float | None:
        return self.model_failures / self.model_rows if self.model_rows else None

    @property
    def application_rate(self) -> float | None:
        return self.application_failures / self.scans if self.scans else None


@dataclass(frozen=True)
class LookupStats:
    scans: int  # lookups rows
    looked_up: int  # titles: hits + misses
    hits: int
    errors: int  # titles the catalogue failed for
    cache_hits: int | None  # None while `lookups` has no cache column

    @property
    def hit_rate(self) -> float | None:
        return self.hits / self.looked_up if self.looked_up else None

    @property
    def cache_hit_rate(self) -> float | None:
        if self.cache_hits is None or not self.looked_up:
            return None
        return self.cache_hits / self.looked_up


def lookup_stats(rows: list[dict]) -> LookupStats:
    looked_up = sum((r.get("hits") or 0) + (r.get("misses") or 0) for r in rows)
    cache = [r.get(CACHE_COLUMN) for r in rows if CACHE_COLUMN in r]
    return LookupStats(scans=len(rows), looked_up=looked_up, hits=sum(r.get("hits") or 0 for r in rows),
                       errors=sum(r.get("errors") or 0 for r in rows),
                       cache_hits=sum(c or 0 for c in cache) if cache else None)


@dataclass(frozen=True)
class Day:
    day: date
    scans: int  # photos stored that day
    with_picks: int  # recommendation rows without error, by the photo's day
    saves: int  # live saves on those picks

    @property
    def save_rate(self) -> float | None:
        return self.saves / self.with_picks if self.with_picks else None


@dataclass(frozen=True)
class Summary:
    scans_started: int
    scans_completed: int
    feedback: SaveRate
    stages: dict[str, StageStats]
    errors: Errors
    lookups: LookupStats
    days: list[Day]

    @property
    def completion_rate(self) -> float | None:
        return self.scans_completed / self.scans_started if self.scans_started else None

    @property
    def scans_per_day(self) -> float | None:
        return self.scans_started / len(self.days) if self.days else None


def _days_of(start: datetime | None, end: datetime, photos: list[dict]) -> list[date]:
    first = start.date() if start else min((parse_ts(p["created_at"]).date() for p in photos), default=end.date())
    last = end.date()
    return [first + timedelta(days=i) for i in range((last - first).days + 1)] if first <= last else []


def summarize(rows: Rows, start: datetime | None, end: datetime) -> Summary:
    """The numbers for one population over `[start, end]`; `rows` is already that population."""
    rows = rows.restrict(rows.photos)  # close the join, so an orphan row cannot break the counts
    photo_day ={p["id"]: parse_ts(p["created_at"]).date() for p in rows.photos}
    rec_photo = {}
    ex_photo = {e["id"]: e["photo_id"] for e in rows.extractions}
    for r in rows.recommendations:
        rec_photo[r["id"]] = ex_photo[r["extraction_id"]]
    ok_recs = [r for r in rows.recommendations if not r.get("error")]
    completed = {rec_photo[r["id"]] for r in ok_recs}
    live_saves = {(s["recommendation_id"], s["pick_index"]) for s in rows.saved
                  if s.get("removed_at") is None and s["recommendation_id"] in rec_photo}

    scans_by_day = Counter(photo_day.values())
    picks_by_day = Counter(photo_day[rec_photo[r["id"]]] for r in ok_recs)
    saves_by_day = Counter(photo_day[rec_photo[rid]] for rid, _ in live_saves)
    days = [Day(d, scans_by_day.get(d, 0), picks_by_day.get(d, 0), saves_by_day.get(d, 0))
            for d in _days_of(start, end, rows.photos)]

    with_extraction = set(ex_photo.values())
    return Summary(
        scans_started=len(rows.photos),
        scans_completed=len(completed),
        feedback=compute(rows.recommendations, rows.saved, rows.feedback),
        stages={"reading": stage_stats("reading", rows.extractions),
                "checking": stage_stats("checking", rows.lookups),
                "choosing": stage_stats("choosing", rows.recommendations)},
        errors=Errors(model_rows=len(rows.extractions) + len(rows.recommendations),
                      model_failures=sum(1 for r in rows.extractions + rows.recommendations if r.get("error")),
                      scans=len(rows.photos),
                      application_failures=sum(1 for p in rows.photos if p["id"] not in with_extraction)),
        lookups=lookup_stats(rows.lookups),
        days=days,
    )


@dataclass(frozen=True)
class PriceCheck:
    """002 D5: the prices in `config/models.toml` carry the date they were last checked."""

    checked: date | None
    age_days: int | None

    @property
    def stale(self) -> bool:
        return self.age_days is None or self.age_days > PRICE_STALE_DAYS


def price_check(checked: date | None, today: date | None = None) -> PriceCheck:
    today = today or datetime.now(UTC).date()
    return PriceCheck(checked=checked, age_days=(today - checked).days if checked else None)


@dataclass(frozen=True)
class Dashboard:
    window: str
    start: datetime | None
    end: datetime
    app: Summary
    labelled: Summary
    prices: PriceCheck


def dashboard(rows: Rows, window: str = DEFAULT_WINDOW, *, now: datetime | None = None,
              prices_checked: date | None = None) -> Dashboard:
    """Everything the page shows, from the rows. `prices_checked` defaults to the config's date."""
    if prices_checked is None:
        from shelfscanner.config import load_config

        prices_checked = load_config().prices_checked
    start, end = window_bounds(window, now)
    windowed = rows.since(start)
    return Dashboard(window=window, start=start, end=end,
                     app=summarize(windowed.app(), start, end),
                     labelled=summarize(windowed.labelled(), start, end),
                     prices=price_check(prices_checked, end.date()))


# --- 009: where the rows come from --------------------------------------------------------------

Source = Callable[[str], Rows]  # window key -> the rows the window needs

PHOTO_COLUMNS = "id, session_id, titles, created_at"
EXTRACTION_COLUMNS = "id, photo_id, model, adapter, error, latency_ms, cost_usd, failover_from, created_at"
RECOMMENDATION_COLUMNS = ("id, extraction_id, model, adapter, error, latency_ms, cost_usd, failover_from, "
                          "parsed_recommendations, created_at")
SAVED_COLUMNS = "id, recommendation_id, pick_index, removed_at, created_at"
FEEDBACK_COLUMNS = "id, recommendation_id, pick_index, kind, created_at"


def fetch(window: str = DEFAULT_WINDOW, now: datetime | None = None) -> Rows:
    """Read the six tables for a window. Every joined row is written at or after its photo, so
    filtering each table on `created_at >= start` is a superset of the join; `restrict` closes it.
    `lookups` is read whole (`*`) so a cache column shows up the day it exists."""
    from shelfscanner.db import get_client

    c = get_client()
    start, _ = window_bounds(window, now)

    def rows_of(table: str, columns: str) -> list[dict]:
        out: list[dict] = []
        while True:
            q = c.table(table).select(columns)
            if start is not None:
                q = q.gte("created_at", start.isoformat())
            chunk = q.order("id").range(len(out), len(out) + PAGE - 1).execute().data
            out.extend(chunk)
            if len(chunk) < PAGE:
                return out

    rows = Rows(photos=rows_of("photos", PHOTO_COLUMNS), extractions=rows_of("extractions", EXTRACTION_COLUMNS),
                recommendations=rows_of("recommendations", RECOMMENDATION_COLUMNS), lookups=rows_of("lookups", "*"),
                saved=rows_of("saved", SAVED_COLUMNS), feedback=rows_of("feedback", FEEDBACK_COLUMNS))
    return rows.restrict(rows.photos)


def rows_from_memory(pipeline) -> Rows:
    """The fake pipeline's dicts as table-shaped rows: its readings stand in for extraction rows
    (no latency or cost, the fake reports none) and it runs no lookups."""
    photos = list(pipeline.photos.values())
    created = {p["id"]: p["created_at"] for p in photos}
    extractions = [{"id": pid, "photo_id": pid, "model": "fake", "adapter": "fake", "error": reading.error,
                    "latency_ms": None, "cost_usd": None, "failover_from": None, "created_at": created[pid]}
                   for pid, reading in pipeline.readings.items()]
    recommendations = [{**{k: rec[k] for k in ("id", "parsed_recommendations", "error")}, "extraction_id": rec["photo_id"],
                        "model": "fake", "adapter": "fake", "latency_ms": None, "cost_usd": None, "failover_from": None,
                        "created_at": created[rec["photo_id"]]} for rec in pipeline.recommendations.values()]
    return Rows(photos=photos, extractions=extractions, recommendations=recommendations, lookups=[],
                saved=list(pipeline.saved_rows), feedback=list(pipeline.feedback_rows))


def source_for(pipeline) -> Source:
    """The rows for a window from wherever the pipeline keeps them: the fake's memory, or the tables."""
    if hasattr(pipeline, "saved_rows"):  # the in-memory fake keeps its rows as attributes
        return lambda window: rows_from_memory(pipeline).since(window_bounds(window)[0])
    return fetch

