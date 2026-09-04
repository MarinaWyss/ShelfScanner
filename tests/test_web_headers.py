"""Response headers (017 D6) on every response: pages, fragments, the event stream, static files and
404s; the CSP nonce is per request and is the one on the inline theme script."""

import re

from fastapi.testclient import TestClient

from shelfscanner.web import headers
from shelfscanner.web.app import create_app
from shelfscanner.web.fakes import FakePipeline, MemorySessions
from tests.test_web_scan import post_photo
from tests.web_images import small_jpeg


def make_client() -> TestClient:
    return TestClient(create_app(pipeline=FakePipeline(), sessions=MemorySessions()))


def _nonce_of(csp: str) -> str:
    m = re.search(r"'nonce-([A-Za-z0-9_-]+)'", csp)
    assert m, csp
    return m.group(1)


def test_every_response_carries_the_headers():
    client = make_client()
    client.get("/books")
    scan_id = post_photo(client, small_jpeg()).json()["id"]
    paths = ["/", "/books", "/books/upload", "/privacy-policy", "/reading-list", "/static/app.js", "/no-such-page",
             f"/scan/{scan_id}"]
    for path in paths:
        res = client.get(path)
        for name, value in headers.HEADERS.items():
            assert res.headers.get(name) == value, (path, name)
        csp = res.headers["content-security-policy"]
        assert csp.startswith("default-src 'self'; script-src 'self' 'nonce-") and "frame-ancestors 'none'" in csp, path
    assert client.get("/no-such-page").status_code == 404
    with client.stream("GET", f"/scan/{scan_id}/events") as res:
        assert res.headers["x-frame-options"] == "DENY" and "content-security-policy" in res.headers
        "".join(res.iter_text())


def test_the_nonce_is_on_the_theme_script_and_differs_per_request():
    client = make_client()
    first = client.get("/")
    second = client.get("/")
    a, b = _nonce_of(first.headers["content-security-policy"]), _nonce_of(second.headers["content-security-policy"])
    assert a != b and len(a) >= 16
    assert f'<script nonce="{a}">' in first.text and f'<script nonce="{b}">' in second.text
    assert first.text.count("<script nonce=") == 1 and "<script>" not in first.text


def test_the_policy_allows_what_the_pages_use():
    csp = headers.csp("n")
    directives = dict(d.strip().split(" ", 1) for d in csp.split(";") if d.strip())
    assert "https://fonts.googleapis.com" in directives["style-src"] and "'unsafe-inline'" in directives["style-src"]
    assert directives["font-src"] == "https://fonts.gstatic.com"
    assert "blob:" in directives["img-src"] and "https://covers.openlibrary.org" in directives["img-src"]
    assert directives["connect-src"] == "'self'"
    assert directives["form-action"] == "'self' mailto:", "the contact form posts to a mailto: address"
    assert "'unsafe-eval'" not in csp and "'unsafe-inline'" not in directives["script-src"]
