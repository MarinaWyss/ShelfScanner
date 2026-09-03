"""The shared aggregation (009 task 1) on seeded rows: windows, the two populations, per-stage
percentiles and cost, the error split, lookups, the price check, and agreement with `research.report`
over the same rows (009 D1)."""

from datetime import UTC, date, datetime, timedelta
from statistics import mean, median

import pytest

from research.report import extraction_stats, recommendation_stats
from shelfscanner.web import metrics
from shelfscanner.web.metrics import Rows, dashboard, percentile, price_check, summarize, window_bounds

NOW = datetime(2026, 9, 10, 15, 0, tzinfo=UTC)
CHECKED = date(2026, 9, 2)


def ts(days_ago: int, hour: int = 12) -> str:
    return (NOW - timedelta(days=days_ago)).replace(hour=hour, minute=0, second=0, microsecond=0).isoformat()


def picks(n: int = 5) -> dict:
    return {"recommendations": [{"title": f"t{i}", "reason": "r"} for i in range(n)]}


class Seed:
    """Builds joined rows with fresh ids. `scan` adds a photo and, optionally, its extraction,
    lookup, recommendation and saves in one call."""

    def __init__(self):
        self.rows = Rows()
        self._ids = iter(range(1, 10_000))

    def scan(self, *, days_ago=0, session=1, titles=(), extraction=True, error=None, latency=1000, cost=0.01,
             failover=None, lookup=None, rec=True, rec_error=None, rec_latency=2000, rec_cost=0.002,
             rec_failover=None, n_picks=5, saves=(), removed=(), marks=()):
        pid = next(self._ids)
        self.rows.photos.append({"id": pid, "session_id": session, "titles": list(titles), "created_at": ts(days_ago)})
        if not extraction:
            return pid
        eid = next(self._ids)
        self.rows.extractions.append({"id": eid, "photo_id": pid, "model": "m", "error": error, "latency_ms": latency,
                                      "cost_usd": cost, "failover_from": failover, "created_at": ts(days_ago),
                                      "image_long_edge": 1568, "found_count": 8, "missed_count": 2, "invented_count": 0})
        if lookup is not None:
            self.rows.lookups.append({"id": next(self._ids), "photo_id": pid, "created_at": ts(days_ago), **lookup})
        if error or not rec:
            return pid
        rid = next(self._ids)
        self.rows.recommendations.append({"id": rid, "extraction_id": eid, "model": "m", "error": rec_error,
                                          "latency_ms": rec_latency, "cost_usd": rec_cost, "failover_from": rec_failover,
                                          "parsed_recommendations": None if rec_error else picks(n_picks),
                                          "valid_vs_extraction": None if rec_error else n_picks,
                                          "valid_vs_ground_truth": None, "specificity_scores": None,
                                          "created_at": ts(days_ago)})
        for i in saves:
            self.rows.saved.append({"id": next(self._ids), "recommendation_id": rid, "pick_index": i,
                                    "removed_at": ts(days_ago) if i in removed else None, "created_at": ts(days_ago)})
        for i in marks:
            self.rows.feedback.append({"id": next(self._ids), "recommendation_id": rid, "pick_index": i,
                                       "kind": "not_for_me", "created_at": ts(days_ago)})
        return pid


@pytest.fixture
def seed() -> Seed:
    s = Seed()
    # App scans in the last week: three complete (one with a save and a mark, one with a save later
    # removed), one model failure at reading, one choosing failure after a failover, one never reached
    # a model (application failure).
    s.scan(days_ago=0, latency=800, cost=0.010, rec_latency=1500, saves=(0, 3), marks=(4,),
           lookup={"hits": 9, "misses": 1, "errors": 0, "latency_ms": 3000})
    s.scan(days_ago=1, latency=1200, cost=0.020, rec_latency=2500, saves=(1,), removed=(1,),
           lookup={"hits": 6, "misses": 4, "errors": 1, "latency_ms": 5000})
    s.scan(days_ago=2, latency=1000, cost=0.015, rec_latency=2000, lookup={"hits": 5, "misses": 0, "errors": 0,
                                                                          "latency_ms": 4000})
    s.scan(days_ago=2, error="parse failure", cost=0.005)
    s.scan(days_ago=3, failover="primary", rec_error="wrong count", rec_cost=0.001, rec_failover="gpt")
    s.scan(days_ago=3, extraction=False)
    # An app scan from three weeks ago: in the 30-day window, out of the 7-day one.
    s.scan(days_ago=20, latency=5000, cost=0.030, rec_latency=9000, saves=(2,))
    # Labelled photos (the test set), one of them re-run twice; no session, no saves.
    s.scan(days_ago=1, session=None, titles=("A", "B"), latency=1100, cost=0.011, rec_latency=1900)
    pid = s.scan(days_ago=4, session=None, titles=("C",), latency=900, cost=0.009, rec_latency=2100)
    s.rows.extractions.append({**s.rows.extractions[-1], "id": 9001, "error": "timeout", "latency_ms": None,
                               "cost_usd": 0.0})
    s.rows.extractions.append({**s.rows.extractions[-2], "id": 9002, "photo_id": pid, "latency_ms": 1300,
                               "cost_usd": 0.013})
    return s


def test_window_bounds_are_whole_utc_days_ending_today():
    start, end = window_bounds("7", NOW)
    assert start == datetime(2026, 9, 4, tzinfo=UTC) and end == NOW
    assert window_bounds("30", NOW)[0] == datetime(2026, 8, 12, tzinfo=UTC)
    assert window_bounds("all", NOW)[0] is None
    with pytest.raises(ValueError):
        window_bounds("14", NOW)


def test_percentile_p50_is_the_median_and_p95_interpolates():
    vs = [800, 1200, 1000, 5000]
    assert percentile(vs, 50) == median(vs)
    assert percentile([1, 2, 3, 4, 5], 95) == pytest.approx(4.8)
    assert percentile([None, 7], 95) == 7 and percentile([], 50) is None


def test_populations_and_windows(seed):
    board = dashboard(seed.rows, "7", now=NOW, prices_checked=CHECKED)
    assert board.app.scans_started == 6 and board.labelled.scans_started == 2
    assert dashboard(seed.rows, "30", now=NOW, prices_checked=CHECKED).app.scans_started == 7
    assert dashboard(seed.rows, "all", now=NOW, prices_checked=CHECKED).app.scans_started == 7
    assert [d.day for d in board.app.days] == [date(2026, 9, 4) + timedelta(days=i) for i in range(7)]


def test_scans_per_day_completion_and_feedback(seed):
    app = dashboard(seed.rows, "7", now=NOW, prices_checked=CHECKED).app
    by_day = {d.day: d for d in app.days}
    assert [by_day[date(2026, 9, 10) - timedelta(days=i)].scans for i in range(7)] == [1, 1, 2, 2, 0, 0, 0]
    assert app.scans_per_day == pytest.approx(6 / 7)
    assert (app.scans_completed, app.completion_rate) == (3, pytest.approx(0.5))
    # Save rate: 2 live saves over 3 scans with picks; one mark over 15 picks. The removed save is not live.
    assert (app.feedback.scans, app.feedback.picks, app.feedback.saves, app.feedback.not_for_me) == (3, 15, 2, 1)
    assert app.feedback.saves_per_scan == pytest.approx(2 / 3)
    assert app.feedback.not_for_me_per_pick == pytest.approx(1 / 15)
    today = by_day[date(2026, 9, 10)]
    assert (today.with_picks, today.saves, today.save_rate) == (1, 2, 2.0)
    assert by_day[date(2026, 9, 9)].save_rate == 0.0


def test_stage_latency_cost_errors_and_failovers(seed):
    app = dashboard(seed.rows, "7", now=NOW, prices_checked=CHECKED).app
    reading = app.stages["reading"]
    assert (reading.rows, reading.errors, reading.failovers) == (4, 1, 1)
    assert reading.p50_ms == median([800, 1200, 1000, 1000])
    assert reading.p95_ms == pytest.approx(percentile([800, 1200, 1000, 1000], 95))
    assert reading.cost_per_scan == pytest.approx(mean([0.010, 0.020, 0.015, 0.01]))
    assert reading.spend_usd == pytest.approx(0.010 + 0.020 + 0.015 + 0.005 + 0.01), "error rows cost too"
    choosing = app.stages["choosing"]
    assert (choosing.rows, choosing.errors, choosing.failovers) == (3, 1, 1)
    assert choosing.p50_ms == 2000 and choosing.cost_per_scan == pytest.approx(0.002)
    checking = app.stages["checking"]
    assert (checking.rows, checking.errors, checking.p50_ms, checking.cost_per_scan) == (3, 1, 4000, None)


def test_error_split_model_versus_application(seed):
    errors = dashboard(seed.rows, "7", now=NOW, prices_checked=CHECKED).app.errors
    assert (errors.model_rows, errors.model_failures) == (9, 2)
    assert errors.model_rate == pytest.approx(2 / 9)
    assert (errors.scans, errors.application_failures) == (6, 1)
    assert errors.application_rate == pytest.approx(1 / 6)


def test_lookup_hit_rate_and_the_cache_column_when_present(seed):
    lookups = dashboard(seed.rows, "7", now=NOW, prices_checked=CHECKED).app.lookups
    assert (lookups.scans, lookups.looked_up, lookups.hits, lookups.errors) == (3, 25, 20, 1)
    assert lookups.hit_rate == pytest.approx(0.8)
    assert lookups.cache_hits is None and lookups.cache_hit_rate is None
    for row in seed.rows.lookups:
        row[metrics.CACHE_COLUMN] = 2
    cached = dashboard(seed.rows, "7", now=NOW, prices_checked=CHECKED).app.lookups
    assert cached.cache_hits == 6 and cached.cache_hit_rate == pytest.approx(6 / 25)


def test_labelled_population_uses_every_row_and_ignores_sessions(seed):
    labelled = dashboard(seed.rows, "7", now=NOW, prices_checked=CHECKED).labelled
    assert labelled.stages["reading"].rows == 3 and labelled.stages["reading"].errors == 1
    assert labelled.scans_completed == 2 and labelled.feedback.saves == 0
    assert labelled.errors.application_failures == 0


def test_price_check_goes_stale_after_ninety_days():
    assert price_check(CHECKED, NOW.date()).age_days == 8
    assert not price_check(CHECKED, NOW.date()).stale
    assert price_check(CHECKED, CHECKED + timedelta(days=91)).stale
    assert not price_check(CHECKED, CHECKED + timedelta(days=90)).stale
    assert price_check(None, NOW.date()).stale
    board = dashboard(Rows(), "7", now=NOW, prices_checked=CHECKED)
    assert board.prices.checked == CHECKED and board.app.scans_started == 0 and board.app.completion_rate is None


def test_agrees_with_the_report_over_the_same_rows(seed):
    """009 D1: over the same rows, the report's error and failover counts, p50 latency and mean cost
    are the dashboard's, and the save rate is the same function. The one place the two differ by
    design: the report's per-model table keeps the latest row per photo (a rerun supersedes), the
    dashboard counts every call. Without reruns they are equal; with them, the report's count is
    the deduped one."""
    board = dashboard(seed.rows, "all", now=NOW, prices_checked=CHECKED)
    labelled = seed.rows.labelled()
    (rec,) = recommendation_stats(labelled.recommendations)
    choosing = board.labelled.stages["choosing"]
    assert (rec.runs, rec.errors, rec.failovers) == (choosing.rows, choosing.errors, choosing.failovers)
    assert rec.p50_latency_ms == choosing.p50_ms and rec.mean_cost_usd == pytest.approx(choosing.cost_per_scan)

    (ex,) = extraction_stats(labelled.extractions)
    reading = board.labelled.stages["reading"]
    assert (ex.errors, ex.failovers) == (reading.errors, reading.failovers)
    assert (ex.photos, reading.rows) == (2, 3), "one photo was rerun: the report keeps its latest row"
    without_reruns = [e for e in labelled.extractions if e["id"] != 9002]
    (ex,) = extraction_stats(without_reruns)
    reading = metrics.stage_stats("reading", without_reruns)
    assert ex.photos == reading.rows and ex.p50_latency_ms == reading.p50_ms
    assert ex.mean_cost_usd == pytest.approx(reading.cost_per_scan)

    app = seed.rows.app()
    assert board.app.feedback == metrics.compute(app.recommendations, app.saved, app.feedback)


def test_rows_from_the_fake_pipeline_after_a_scan():
    from fastapi.testclient import TestClient

    from shelfscanner.web.app import create_app
    from shelfscanner.web.fakes import FakePipeline, MemorySessions
    from tests.test_web_scan import events_of, post_photo
    from tests.web_images import small_jpeg

    pipeline = FakePipeline()
    client = TestClient(create_app(pipeline=pipeline, sessions=MemorySessions()))
    scan_id = post_photo(client, small_jpeg()).json()["id"]
    events_of(client, scan_id)
    rid = client.get(f"/scan/{scan_id}").json()["recommendation_id"]
    client.post(f"/picks/{rid}/1/save")
    client.post(f"/picks/{rid}/2/not-for-me")

    rows = metrics.source_for(pipeline)("7")
    board = dashboard(rows, "7", prices_checked=CHECKED)
    assert board.app.scans_started == 1 and board.app.scans_completed == 1
    assert board.app.feedback.saves == 1 and board.app.feedback.not_for_me == 1 and board.app.feedback.picks == 5
    assert board.labelled.scans_started == 0
    assert summarize(rows, *window_bounds("7")).stages["reading"].p50_ms is None, "the fake reports no latency"
