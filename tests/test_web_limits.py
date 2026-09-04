"""Scan limits (008 task 1): scans per session per rolling hour and the app's daily cap, checked in
`POST /scan` before anything is stored, refused with the number (D1). A fixed clock and the fake
pipeline's rows stand in for time and the tables."""

from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from shelfscanner.web import limits, scan, sessions
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


# --- change 017: the address limit (D1) and the cookieless scan (D2) --------------------------------


def test_the_address_limit_is_read_from_the_environment():
    assert limits.from_env({}).scans_per_address_hour == 30
    assert limits.from_env({limits.SCANS_PER_ADDRESS_HOUR_ENV: "5"}) == Limits(10, 5.0, 5)
    with pytest.raises(SystemExit):
        limits.from_env({limits.SCANS_PER_ADDRESS_HOUR_ENV: "many"})


def test_check_counts_the_address_across_sessions_after_the_device():
    clock = Clock()
    pipeline = FakePipeline(clock=clock)
    lim = Limits(scans_per_hour=10, daily_cap_usd=5.0, scans_per_address_hour=2)
    clock.now = NOON - timedelta(minutes=61)
    pipeline.store(1, b"x", resized_by_client=True, client_hash="h1")  # too old to count
    clock.now = NOON
    pipeline.store(1, b"x", resized_by_client=True, client_hash="h1")
    pipeline.store(2, b"x", resized_by_client=True, client_hash="h1")  # a second session, same address
    pipeline.store(3, b"x", resized_by_client=True, client_hash="h2")
    refusal = limits.check(pipeline, 4, lim, NOON, "h1")
    assert refusal is not None and refusal.kind == "rate" and refusal.status == 429
    assert refusal.message == limits.address_message(2, 2)
    assert "This network has scanned 2 shelves" in refusal.message and "limit is 2 per hour for one network" in refusal.message
    assert limits.check(pipeline, 4, lim, NOON, "h2") is None, "another address is under its own limit"
    assert limits.check(pipeline, 4, lim, NOON, None) is None, "an unknown address is not counted"
    assert limits.check(pipeline, 4, lim, NOON + timedelta(minutes=61), "h1") is None, "the window rolls"
    pipeline.store(4, b"x", resized_by_client=True, client_hash="h1")
    assert "This device" in limits.check(pipeline, 4, Limits(1, 5.0, 2), NOON, "h1").message, "the device limit first"


def test_dropping_the_cookie_does_not_reset_the_limit():
    """The bypass the review found: a fresh cookie per request was a fresh device per request."""
    clock = Clock()
    pipeline = FakePipeline(clock=clock)
    store = MemorySessions(clock=clock)
    app = create_app(pipeline=pipeline, sessions=store, limits=Limits(1, 5.0, 2), clock=clock)
    a, b, c = TestClient(app), TestClient(app), TestClient(app)  # three cookie jars, one address
    assert post_photo(a, small_jpeg()).status_code == 201
    assert post_photo(a, small_jpeg()).status_code == 429, "the device limit"
    assert post_photo(b, small_jpeg()).status_code == 201, "a second device on the address is under 2"
    res = post_photo(c, small_jpeg())
    assert res.status_code == 429 and res.json() == {"error": limits.address_message(2, 2), "stage": "rate"}
    assert "This network" in res.json()["error"]
    html = post_photo(c, small_jpeg(), headers={"HX-Request": "true"})
    assert html.status_code == 429 and "Scan limit reached" in html.text and "This network" in html.text
    assert len(pipeline.photos) == 2

    d = TestClient(app)  # a different address is not affected
    assert post_photo(d, small_jpeg(), headers={"x-forwarded-for": "203.0.113.9"}).status_code == 201


def test_the_address_is_the_first_forwarded_value_and_is_stored_hashed():
    client, pipeline, _ = make_client(Limits())
    res = post_photo(client, small_jpeg(), headers={"x-forwarded-for": "203.0.113.5, 10.0.0.1"})
    assert res.status_code == 201
    row = pipeline.photos[res.json()["id"]]
    assert row["client_hash"] == sessions.hash_address("203.0.113.5")
    assert "203.0.113.5" not in str(row), "the address itself is never stored"
    res = post_photo(client, small_jpeg())  # no proxy header: the socket peer
    assert pipeline.photos[res.json()["id"]]["client_hash"] == sessions.hash_address("testclient")


def test_a_cookieless_scan_is_refused_and_makes_no_session():
    clock = Clock()
    pipeline = FakePipeline(clock=clock)
    store = MemorySessions(clock=clock)
    client = TestClient(create_app(pipeline=pipeline, sessions=store, limits=Limits(), clock=clock))
    res = client.post("/scan", files={"photo": ("shelf.jpg", small_jpeg(), "image/jpeg")})
    assert res.status_code == 400 and res.json() == {"error": scan.NO_SESSION, "stage": "uploading"}
    assert "set-cookie" not in res.headers and store.rows == {} and pipeline.photos == {}
    html = client.post("/scan", files={"photo": ("shelf.jpg", small_jpeg(), "image/jpeg")}, headers={"HX-Request": "true"})
    assert html.status_code == 400 and scan.NO_SESSION in html.text and store.rows == {}
    client.get("/books")  # the way the form gets its session
    assert len(store.rows) == 1
    assert post_photo(client, small_jpeg()).status_code == 201
