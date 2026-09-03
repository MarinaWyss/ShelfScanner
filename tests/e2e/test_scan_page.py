"""The page in a real browser (003 task 3): pick a photo, watch the stages, read the titles.

A uvicorn server runs in a thread with the in-memory fakes, the same app that
`SHELFSCANNER_FAKE_PIPELINE=1 uv run uvicorn shelfscanner.web.app:app` serves.
"""

import io
import re
import socket
import threading
import time
from dataclasses import dataclass

import pytest
import uvicorn
from PIL import Image
from playwright.sync_api import Browser, Page, expect

from shelfscanner.images import has_metadata
from shelfscanner.web.app import create_app
from shelfscanner.web.fakes import DEFAULT_TITLES, FakeClient, FakePipeline, MemorySessions
from shelfscanner.web.sessions import COOKIE
from tests.web_images import GPS_IFD, phone_jpeg_with_gps, small_jpeg


@dataclass
class Server:
    url: str
    pipeline: FakePipeline
    sessions: MemorySessions
    posted_bytes: list[int]  # request body size of every POST /scan the server received


def counting_bodies(app, sizes: list[int]):
    """Wrap the ASGI app so the test can see exactly how many body bytes each scan upload carried."""

    async def wrapped(scope, receive, send):
        if scope["type"] != "http" or scope["method"] != "POST" or scope["path"] != "/scan":
            await app(scope, receive, send)
            return
        total = 0

        async def counted():
            nonlocal total
            message = await receive()
            total += len(message.get("body", b""))
            if not message.get("more_body"):
                sizes.append(total)
            return message

        await app(scope, counted, send)

    return wrapped


@pytest.fixture
def server():
    pipeline = FakePipeline(FakeClient(delay_s=0.5))
    sessions = MemorySessions()
    sizes: list[int] = []
    app = counting_bodies(create_app(pipeline=pipeline, sessions=sessions), sizes)
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        port = s.getsockname()[1]
    uv = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning"))
    thread = threading.Thread(target=uv.run, daemon=True)
    thread.start()
    deadline = time.monotonic() + 10
    while not uv.started:
        assert time.monotonic() < deadline, "server did not start"
        time.sleep(0.02)
    yield Server(f"http://127.0.0.1:{port}", pipeline, sessions, sizes)
    uv.should_exit = True
    thread.join(timeout=5)


def pick(page: Page, data: bytes, name: str = "shelf.jpg") -> None:
    page.set_input_files("input[name=photo]", {"name": name, "mimeType": "image/jpeg", "buffer": data})


def test_photo_to_titles_with_progress(server: Server, page: Page):
    page.goto(server.url)
    pick(page, small_jpeg())
    expect(page.locator("#scan-button")).to_be_enabled()
    page.click("#scan-button")

    expect(page.locator("#stage-uploaded")).to_have_class("done")
    expect(page.locator("#stage-reading")).to_have_class("active")
    expect(page.locator("#stage-done")).to_have_class("done", timeout=10_000)
    expect(page.locator("#stage-reading")).to_have_class("done")
    expect(page.locator("#titles li")).to_have_text(DEFAULT_TITLES)

    assert list(server.pipeline.readings.values())[0].titles == DEFAULT_TITLES


def test_browser_resize_keeps_metadata_off_the_wire(server: Server, page: Page):
    original = phone_jpeg_with_gps()
    assert len(original) > 1_000_000 and has_metadata(original)
    posts = []
    page.on("request", lambda req: posts.append(req) if req.method == "POST" else None)

    page.goto(server.url)
    pick(page, original)
    expect(page.locator("#scan-button")).to_be_enabled(timeout=15_000)
    page.click("#scan-button")
    expect(page.locator("#titles")).to_be_visible(timeout=15_000)

    assert len(posts) == 1 and posts[0].url.endswith("/scan")
    assert int(posts[0].all_headers()["content-length"]) < 1_000_000
    (received,) = server.posted_bytes
    assert received < 1_000_000, f"request body was {received} bytes"

    (stored,) = server.pipeline.blobs.values()
    assert not has_metadata(stored)
    with Image.open(io.BytesIO(stored)) as im:
        assert not im.getexif().get_ifd(GPS_IFD)
        assert max(im.size) <= 1568
        assert im.height > im.width, "the orientation tag was applied before the tag was dropped"


def test_reading_failure_names_the_stage(server: Server, page: Page):
    server.pipeline.client.error = "provider timeout after 180s"
    page.goto(server.url)
    pick(page, small_jpeg())
    expect(page.locator("#scan-button")).to_be_enabled()
    page.click("#scan-button")
    expect(page.locator("#scan-error")).to_contain_text("Reading the shelf failed", timeout=10_000)
    expect(page.locator("#scan-error")).to_contain_text("provider timeout")
    expect(page.locator("#stage-reading")).to_have_class("failed")


def test_two_browsers_two_sessions_and_a_reload_keeps_one(server: Server, browser: Browser):
    first, second = browser.new_context(), browser.new_context()
    try:
        a, b = first.new_page(), second.new_page()
        a.goto(server.url)
        b.goto(server.url)
        token_a = next(c["value"] for c in first.cookies() if c["name"] == COOKIE)
        token_b = next(c["value"] for c in second.cookies() if c["name"] == COOKIE)
        assert token_a != token_b
        assert len(server.sessions.rows) == 2

        a.reload()
        expect(a.locator("h1")).to_have_text(re.compile("ShelfScanner"))
        assert next(c["value"] for c in first.cookies() if c["name"] == COOKIE) == token_a
        assert len(server.sessions.rows) == 2
    finally:
        first.close()
        second.close()
