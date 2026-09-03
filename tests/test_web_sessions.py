"""Device sessions (003 task 1): a cookie on first visit, a row per device, only the hash stored.

A first visit to `/` is redirected to the preferences page (005); the cookie is
set on that redirect, so the tests look at it with redirects off.
"""

import hashlib
from datetime import UTC, datetime

from fastapi.testclient import TestClient

from shelfscanner.web.app import create_app
from shelfscanner.web.fakes import FakePipeline, MemorySessions
from shelfscanner.web.sessions import COOKIE, LAST_SEEN_THROTTLE_S, hash_token, new_token, should_touch


def make_client(store: MemorySessions | None = None) -> tuple[TestClient, MemorySessions]:
    store = store or MemorySessions()
    return TestClient(create_app(pipeline=FakePipeline(), sessions=store)), store


def test_first_visit_sets_a_cookie_and_creates_a_row():
    client, store = make_client()
    res = client.get("/", follow_redirects=False)
    assert res.status_code == 302 and res.headers["location"] == "/preferences"
    token = res.cookies[COOKIE]
    assert len(store.rows) == 1
    assert token not in store.rows, "the raw token must not be stored"
    assert store.rows[hash_token(token)] == 1
    set_cookie = res.headers["set-cookie"]
    assert "HttpOnly" in set_cookie and "SameSite=Lax" in set_cookie and "Path=/" in set_cookie


def test_cookie_is_secure_only_over_https():
    # 010: Vercel terminates TLS and forwards plain http with x-forwarded-proto; the local network is http.
    client, _ = make_client()
    plain = client.get("/", follow_redirects=False).headers["set-cookie"]
    assert "Secure" not in plain
    client, _ = make_client()
    forwarded = client.get("/", follow_redirects=False, headers={"x-forwarded-proto": "https"}).headers["set-cookie"]
    assert "; Secure" in forwarded and "HttpOnly" in forwarded
    client, _ = make_client()
    client.base_url = "https://testserver"
    direct = client.get("/", follow_redirects=False).headers["set-cookie"]
    assert "; Secure" in direct


def test_second_request_reuses_the_session():
    client, store = make_client()
    first = client.get("/", follow_redirects=False)
    second = client.get("/", follow_redirects=False)
    assert "set-cookie" not in second.headers
    assert client.cookies[COOKIE] == first.cookies[COOKIE]
    assert len(store.rows) == 1


def test_last_seen_is_written_at_most_once_per_ten_minutes():
    now = [datetime(2026, 9, 3, 12, 0, tzinfo=UTC)]
    client, store = make_client(MemorySessions(clock=lambda: now[0]))
    client.get("/", follow_redirects=False)
    assert store.last_seen[1] == now[0] and store.writes == {}, "created, not yet touched"
    for minutes in (1, 5, 9):
        now[0] = datetime(2026, 9, 3, 12, minutes, tzinfo=UTC)
        client.get("/", follow_redirects=False)
    assert store.writes == {}, "three visits inside the window write nothing"
    now[0] = datetime(2026, 9, 3, 12, 10, tzinfo=UTC)
    client.get("/", follow_redirects=False)
    assert store.writes == {1: 1} and store.last_seen[1] == now[0]
    now[0] = datetime(2026, 9, 3, 12, 15, tzinfo=UTC)
    client.get("/", follow_redirects=False)
    assert store.writes == {1: 1}, "the window restarts from the write"


def test_should_touch_reads_the_column_as_the_database_returns_it():
    now = datetime(2026, 9, 3, 12, 10, tzinfo=UTC)
    assert should_touch(None, now)
    assert should_touch("2026-09-03T12:00:00+00:00", now)
    assert should_touch("2026-09-03T11:59:59.123456Z", now)
    assert not should_touch("2026-09-03T12:00:01+00:00", now)
    assert not should_touch(datetime(2026, 9, 3, 12, 5), now), "a naive timestamp is UTC"
    assert LAST_SEEN_THROTTLE_S == 600


def test_two_devices_get_two_sessions():
    store = MemorySessions()
    a, _ = make_client(store)
    b, _ = make_client(store)
    a.get("/")
    b.get("/")
    assert a.cookies[COOKIE] != b.cookies[COOKIE]
    assert len(store.rows) == 2


def test_unknown_token_gets_a_fresh_session():
    client, store = make_client()
    client.cookies.set(COOKIE, "stale-token-from-a-wiped-table")
    res = client.get("/", follow_redirects=False)
    assert COOKIE in res.cookies
    assert res.cookies[COOKIE] != "stale-token-from-a-wiped-table"
    assert len(store.rows) == 1


def test_static_files_do_not_touch_sessions():
    client, store = make_client()
    res = client.get("/static/app.js")
    assert res.status_code == 200
    assert "set-cookie" not in res.headers
    assert store.rows == {}


def test_hash_is_sha256_and_tokens_are_random():
    token = new_token()
    assert hash_token(token) == hashlib.sha256(token.encode()).hexdigest()
    assert new_token() != token and len(token) >= 40
