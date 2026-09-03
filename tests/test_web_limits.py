"""Scan limits (008 task 1): scans per session per rolling hour and the app's daily cap, checked in
`POST /scan` before anything is stored, refused with the number (D1). A fixed clock and the fake
pipeline's rows stand in for time and the tables."""

from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from shelfscanner.web import limits
from shelfscanner.web.app import create_app
from shelfscanner.web.fakes import FakePipeline, MemorySessions
from shelfscanner.web.limits import Limits
from tests.test_web_scan import post_photo
from tests.web_images import small_jpeg

NOON = datetime(2026, 9, 3, 12, 0, tzinfo=UTC)


class Clock:
    def __init__(self, now: datetime = NOON) -> None:
        self.now = now

    def __call__(self) -> datetime:
        return self.now

    def advance(self, **kwargs) -> None:
        self.now += timedelta(**kwargs)


def make_client(lim: Limits, clock: Clock | None = None) -> tuple[TestClient, FakePipeline, Clock]:
    clock = clock or Clock()
    pipeline = FakePipeline(clock=clock)
    app = create_app(pipeline=pipeline, sessions=MemorySessions(clock=clock), limits=lim, clock=clock)
    return TestClient(app), pipeline, clock


# --- the module ---------------------------------------------------------------------------------------


def test_defaults_are_ten_scans_an_hour_and_five_dollars_a_day():
    assert limits.from_env({}) == Limits(scans_per_hour=10, daily_cap_usd=5.0)
    assert limits.from_env({limits.SCANS_PER_HOUR_ENV: " 3 ", limits.DAILY_CAP_ENV: "0.5"}) == Limits(3, 0.5)
    assert limits.from_env({limits.SCANS_PER_HOUR_ENV: "", limits.DAILY_CAP_ENV: ""}) == Limits()


@pytest.mark.parametrize("environ", [{limits.SCANS_PER_HOUR_ENV: "ten"}, {limits.DAILY_CAP_ENV: "-1"},
                                     {limits.SCANS_PER_HOUR_ENV: "2.5"}])
def test_a_bad_value_refuses_to_start(environ):
    with pytest.raises(SystemExit):
        limits.from_env(environ)


def test_day_start_is_midnight_utc():
    assert limits.day_start(NOON) == datetime(2026, 9, 3, tzinfo=UTC)
    late = datetime(2026, 9, 3, 23, 30, tzinfo=UTC).astimezone(timedelta(hours=2).__class__ and UTC)
    assert limits.day_start(late) == datetime(2026, 9, 3, tzinfo=UTC)


def test_check_counts_the_sessions_scans_in_the_rolling_hour():
    clock = Clock()
    pipeline = FakePipeline(clock=clock)
    lim = Limits(scans_per_hour=3, daily_cap_usd=5.0)
    clock.now = NOON - timedelta(minutes=61)
    pipeline.store(1, b"x", resized_by_client=True)  # too old to count
    clock.now = NOON - timedelta(minutes=59)
    pipeline.store(1, b"x", resized_by_client=True)
    pipeline.store(2, b"x", resized_by_client=True)  # another device
    clock.now = NOON
    assert limits.check(pipeline, 1, lim, NOON) is None
    pipeline.store(1, b"x", resized_by_client=True)
    pipeline.store(1, b"x", resized_by_client=True)
    refusal = limits.check(pipeline, 1, lim, NOON)
    assert refusal is not None and refusal.kind == "rate" and refusal.status == 429
    assert "3 shelves in the last hour" in refusal.message and "limit is 3 per hour" in refusal.message
    assert limits.check(pipeline, 2, lim, NOON) is None, "the other device is under its own limit"
    assert limits.check(pipeline, 1, lim, NOON + timedelta(minutes=2)) is None, "the window rolls"


def test_check_sums_todays_spend_across_every_session():
    pipeline = FakePipeline()
    lim = Limits(scans_per_hour=10, daily_cap_usd=5.0)
    pipeline.runs = [{"cost_usd": 4.0, "created_at": (NOON - timedelta(days=1)).isoformat()},  # yesterday
                     {"cost_usd": 3.0, "created_at": datetime(2026, 9, 3, 0, 0, tzinfo=UTC).isoformat()},
                     {"cost_usd": None, "created_at": NOON.isoformat()},
                     {"cost_usd": "1.5", "created_at": NOON.isoformat()}]
    assert limits.check(pipeline, 1, lim, NOON) is None, "$4.50 today is under $5"
    pipeline.runs.append({"cost_usd": 0.5, "created_at": NOON.isoformat()})
    refusal = limits.check(pipeline, 1, lim, NOON)
    assert refusal is not None and refusal.kind == "cap" and refusal.status == 503
    assert "$5.00 on scans today" in refusal.message and "daily limit of $5.00" in refusal.message
    assert limits.check(pipeline, 1, lim, NOON + timedelta(days=1)) is None, "a new day, a new budget"


def test_the_session_limit_is_reported_before_the_cap():
    pipeline = FakePipeline()
    pipeline.runs = [{"cost_usd": 9.0, "created_at": NOON.isoformat()}]
    pipeline.store(1, b"x", resized_by_client=True)
    assert limits.check(pipeline, 1, Limits(scans_per_hour=1, daily_cap_usd=5.0), pipeline.clock()).kind == "rate"


# --- through the routes -------------------------------------------------------------------------------


def test_the_n_plus_first_scan_in_an_hour_is_refused_with_the_number():
    client, pipeline, clock = make_client(Limits(scans_per_hour=2, daily_cap_usd=5.0))
    assert post_photo(client, small_jpeg()).status_code == 201
    clock.advance(minutes=20)
    assert post_photo(client, small_jpeg()).status_code == 201
    clock.advance(minutes=20)
    res = post_photo(client, small_jpeg())
    assert res.status_code == 429
    assert res.json() == {"error": limits.rate_message(2, 2), "stage": "rate"}
    assert "2 shelves in the last hour" in res.json()["error"] and "limit is 2 per hour" in res.json()["error"]
    assert len(pipeline.photos) == 2, "nothing was stored"

    html = post_photo(client, small_jpeg(), headers={"HX-Request": "true"})
    assert html.status_code == 429 and "Scan limit reached" in html.text and 'data-stage="rate"' in html.text
    assert "limit is 2 per hour" in html.text

    clock.advance(minutes=21)  # the first scan is now 61 minutes old
    assert post_photo(client, small_jpeg()).status_code == 201


def test_the_limit_is_per_session():
    clock = Clock()
    pipeline = FakePipeline(clock=clock)
    app = create_app(pipeline=pipeline, sessions=MemorySessions(clock=clock), limits=Limits(1, 5.0), clock=clock)
    a, b = TestClient(app), TestClient(app)
    assert post_photo(a, small_jpeg()).status_code == 201
    assert post_photo(a, small_jpeg()).status_code == 429
    assert post_photo(b, small_jpeg()).status_code == 201


def test_the_daily_cap_stops_every_scan_with_the_amount():
    client, pipeline, clock = make_client(Limits(scans_per_hour=10, daily_cap_usd=0.05))
    pipeline.runs.append({"cost_usd": 0.05, "created_at": clock().isoformat()})
    res = post_photo(client, small_jpeg())
    assert res.status_code == 503
    assert res.json()["stage"] == "cap" and "$0.05 on scans today" in res.json()["error"]
    assert "daily limit of $0.05" in res.json()["error"]
    assert pipeline.photos == {}
    html = post_photo(client, small_jpeg(), headers={"HX-Request": "true"})
    assert html.status_code == 503 and "Daily budget reached" in html.text and 'data-stage="cap"' in html.text

    clock.advance(days=1)
    assert post_photo(client, small_jpeg()).status_code == 201


def test_the_app_reads_the_limits_from_the_environment(monkeypatch):
    monkeypatch.setenv(limits.SCANS_PER_HOUR_ENV, "1")
    monkeypatch.setenv(limits.DAILY_CAP_ENV, "7")
    monkeypatch.setattr(limits, "load_dotenv", lambda *a, **k: None)
    app = create_app(pipeline=FakePipeline(), sessions=MemorySessions())
    assert app.state.limits == Limits(1, 7.0)
    client = TestClient(app)
    assert post_photo(client, small_jpeg()).status_code == 201
    assert post_photo(client, small_jpeg()).status_code == 429
