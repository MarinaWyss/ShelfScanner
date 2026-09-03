"""The page in a real browser (003 task 3, 005): pick a photo, watch the stages, read the picks.

The server fixture and the helpers live in `conftest.py`.
"""

import io
import re

from PIL import Image
from playwright.sync_api import Browser, Page, expect

from shelfscanner.images import has_metadata
from shelfscanner.web.fakes import DEFAULT_PICKS, DEFAULT_TITLES
from shelfscanner.web.sessions import COOKIE
from tests.e2e.conftest import Server, open_scan_page, pick
from tests.web_images import GPS_IFD, phone_jpeg_with_gps, small_jpeg


def test_photo_to_picks_with_progress(server: Server, page: Page):
    open_scan_page(page, server.url)
    pick(page, small_jpeg())
    expect(page.locator("#scan-button")).to_be_enabled()
    page.click("#scan-button")

    expect(page.locator("#stage-uploaded")).to_have_class("done")
    expect(page.locator("#stage-reading")).to_have_class("active")
    expect(page.locator("#stage-choosing")).to_have_class("active", timeout=10_000)
    expect(page.locator("#stage-reading")).to_have_class("done")
    expect(page.locator("#stage-done")).to_have_class("done", timeout=10_000)
    expect(page.locator("#stage-choosing")).to_have_class("done")
    expect(page.locator("#picks .pick-title")).to_have_text([p["title"] for p in DEFAULT_PICKS])
    expect(page.locator("#titles li")).to_have_text(DEFAULT_TITLES)

    assert list(server.pipeline.readings.values())[0].titles == DEFAULT_TITLES
    assert len(list(server.pipeline.choosings.values())[0].picks) == 5


def test_browser_resize_keeps_metadata_off_the_wire(server: Server, page: Page):
    original = phone_jpeg_with_gps()
    assert len(original) > 1_000_000 and has_metadata(original)
    posts = []
    page.on("request", lambda req: posts.append(req) if req.method == "POST" and req.url.endswith("/scan") else None)

    open_scan_page(page, server.url)
    pick(page, original)
    expect(page.locator("#scan-button")).to_be_enabled(timeout=15_000)
    page.click("#scan-button")
    expect(page.locator("#picks")).to_be_visible(timeout=15_000)

    assert len(posts) == 1
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
    open_scan_page(page, server.url)
    pick(page, small_jpeg())
    expect(page.locator("#scan-button")).to_be_enabled()
    page.click("#scan-button")
    expect(page.locator("#scan-error")).to_contain_text("Reading the shelf failed", timeout=10_000)
    expect(page.locator("#scan-error")).to_contain_text("provider timeout")
    expect(page.locator("#stage-reading")).to_have_class("failed")
    expect(page.locator("#stage-choosing")).to_have_class("todo")


def test_choosing_failure_names_the_stage(server: Server, page: Page):
    server.pipeline.client.text_error = "http 429: rate limited"
    open_scan_page(page, server.url)
    pick(page, small_jpeg())
    expect(page.locator("#scan-button")).to_be_enabled()
    page.click("#scan-button")
    expect(page.locator("#scan-error")).to_contain_text("Choosing failed", timeout=10_000)
    expect(page.locator("#scan-error")).to_contain_text("429")
    expect(page.locator("#stage-reading")).to_have_class("done")
    expect(page.locator("#stage-choosing")).to_have_class("failed")


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
        expect(a.locator("h1")).to_have_text(re.compile("What do you like to read"))
        assert next(c["value"] for c in first.cookies() if c["name"] == COOKIE) == token_a
        assert len(server.sessions.rows) == 2
    finally:
        first.close()
        second.close()
