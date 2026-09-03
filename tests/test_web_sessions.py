"""Device sessions (003 task 1): a cookie on first visit, a row per device, only the hash stored."""

import hashlib

from fastapi.testclient import TestClient

from shelfscanner.web.app import create_app
from shelfscanner.web.fakes import FakePipeline, MemorySessions
from shelfscanner.web.sessions import COOKIE, hash_token, new_token


def make_client(store: MemorySessions | None = None) -> tuple[TestClient, MemorySessions]:
    store = store or MemorySessions()
    return TestClient(create_app(pipeline=FakePipeline(), sessions=store)), store


def test_first_visit_sets_a_cookie_and_creates_a_row():
    client, store = make_client()
    res = client.get("/")
    assert res.status_code == 200
    token = res.cookies[COOKIE]
    assert len(store.rows) == 1
    assert token not in store.rows, "the raw token must not be stored"
    assert store.rows[hash_token(token)] == 1
    set_cookie = res.headers["set-cookie"]
    assert "HttpOnly" in set_cookie and "SameSite=Lax" in set_cookie and "Path=/" in set_cookie


def test_second_request_reuses_the_session():
    client, store = make_client()
    first = client.get("/")
    second = client.get("/")
    assert "set-cookie" not in second.headers
    assert client.cookies[COOKIE] == first.cookies[COOKIE]
    assert len(store.rows) == 1
    assert store.seen[1] == 1, "the second visit touches last_seen"


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
    res = client.get("/")
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
