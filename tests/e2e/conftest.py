"""The server the browser tests drive: uvicorn in a thread with the in-memory fakes, the same app
that `SHELFSCANNER_FAKE_PIPELINE=1 uv run uvicorn shelfscanner.web.app:app` serves."""

import socket
import threading
import time
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass

import pytest
import uvicorn
from playwright.sync_api import Page, expect

from shelfscanner.web.app import create_app
from shelfscanner.web.fakes import FakeClient, FakePipeline, MemorySessions
from shelfscanner.web.limits import Limits


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


@contextmanager
def running_server(limits: Limits | None = None) -> Iterator[Server]:
    """The app on a free local port with the fakes; `limits` overrides the environment's (008)."""
    pipeline = FakePipeline(FakeClient(delay_s=0.5))
    sessions = MemorySessions()
    sizes: list[int] = []
    app = counting_bodies(create_app(pipeline=pipeline, sessions=sessions, limits=limits), sizes)
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
    try:
        yield Server(f"http://127.0.0.1:{port}", pipeline, sessions, sizes)
    finally:
        uv.should_exit = True
        thread.join(timeout=5)


@pytest.fixture
def server():
    with running_server(Limits()) as srv:
        yield srv


@pytest.fixture
def limited_server():
    """A server that allows two scans an hour per device (008)."""
    with running_server(Limits(scans_per_hour=2, daily_cap_usd=5.0)) as srv:
        yield srv


def open_scan_page(page: Page, url: str) -> None:
    """Go to the app; a first visit lands on the preferences page, which is skipped here."""
    page.goto(url)
    if page.url.endswith("/preferences"):
        page.click("#prefs-skip button")
    expect(page.locator("#scan-form")).to_be_visible()


def pick(page: Page, data: bytes, name: str = "shelf.jpg", mime_type: str = "image/jpeg") -> None:
    page.set_input_files("input[name=photo]", {"name": name, "mimeType": mime_type, "buffer": data})
