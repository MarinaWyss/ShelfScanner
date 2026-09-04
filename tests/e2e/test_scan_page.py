"""The page in a real browser (003 task 3, 005): pick a photo, watch the stages, read the picks.

The server fixture and the helpers live in `conftest.py`.
"""

import io

from PIL import Image
from playwright.sync_api import Browser, Page, expect

from shelfscanner.images import has_metadata
from shelfscanner.web.fakes import DEFAULT_PICKS, DEFAULT_TITLES
from shelfscanner.web.sessions import COOKIE
from tests.e2e.conftest import Server, open_scan_page, pick
from tests.web_images import GPS_IFD, phone_jpeg_with_gps, small_jpeg


def test_homepage_explains_and_leads_to_the_scan_page(server: Server, page: Page):
    page.goto(server.url)
    expect(page.locator("h1")).to_have_text("AI bookshelf scanner and book recommender")
    expect(page.locator(".steps li")).to_have_count(3)
    expect(page.locator(".steps h3")).to_have_text(["Upload Photo", "Set Preferences", "Find Matching Books"])
    expect(page.locator(".cta h2")).to_have_text("Start Using ShelfScanner Today")
    assert page.locator('link[rel="icon"]').get_attribute("href") == "/static/favicon.svg"
    assert page.request.get(f"{server.url}/static/favicon.svg").ok and page.request.get(f"{server.url}/static/apple-touch-icon.png").ok
    page.get_by_role("link", name="Start Scanning").first.click()
    expect(page).to_have_url(f"{server.url}/books")  # step 1: preferences
    expect(page.locator("#stepper")).to_have_attribute("data-step", "1")


def test_the_theme_toggle_flips_and_is_remembered(server: Server, page: Page):
    # 016: the system setting until the device chooses; the choice is kept in localStorage.
    page.goto(server.url)
    expect(page.locator("html")).to_have_attribute("data-theme", "light")
    expect(page.locator("#theme-toggle")).to_contain_text("Dark")
    page.click("#theme-toggle")
    expect(page.locator("html")).to_have_attribute("data-theme", "dark")
    expect(page.locator("#theme-toggle")).to_contain_text("Light")
    page.reload()
    expect(page.locator("html")).to_have_attribute("data-theme", "dark")
    page.goto(f"{server.url}/books")
    expect(page.locator("html")).to_have_attribute("data-theme", "dark")
    page.click("#theme-toggle")
    expect(page.locator("html")).to_have_attribute("data-theme", "light")


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


def test_a_click_with_no_photo_says_so_and_sends_nothing(server: Server, page: Page):
    # 012: no `required` on the input (iOS Safari enforces it silently); the script says so and opens the picker.
    posts = []
    page.on("request", lambda req: posts.append(req) if req.method == "POST" and req.url.endswith("/scan") else None)
    open_scan_page(page, server.url)
    expect(page.locator("#scan-hint")).to_be_hidden()
    with page.expect_file_chooser() as chooser:
        page.click("#scan-button")
    assert chooser.value.is_multiple() is False
    expect(page.locator("#scan-hint")).to_have_text("Choose a photo first.")
    assert posts == [] and page.locator("#scan").inner_html().strip() == ""
    pick(page, small_jpeg())
    expect(page.locator("#scan-button")).to_be_enabled()
    page.click("#scan-button")
    expect(page.locator("#scan-hint")).to_be_hidden()
    expect(page.locator("#stage-uploaded")).to_have_class("done")


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
    server.pipeline.client.error = "timeout: no answer after 180s"
    open_scan_page(page, server.url)
    pick(page, small_jpeg())
    expect(page.locator("#scan-button")).to_be_enabled()
    page.click("#scan-button")
    expect(page.locator("#scan-error")).to_contain_text("Reading the shelf failed", timeout=10_000)
    expect(page.locator("#scan-error")).to_contain_text("failed: timeout.")  # 017 D5: the kind, not the text
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
        a.goto(f"{server.url}/books")
        b.goto(f"{server.url}/books")
        token_a = next(c["value"] for c in first.cookies() if c["name"] == COOKIE)
        token_b = next(c["value"] for c in second.cookies() if c["name"] == COOKIE)
        assert token_a != token_b
        assert len(server.sessions.rows) == 2

        a.reload()
        expect(a.locator("h1")).to_have_text("Book Scanner")
        assert next(c["value"] for c in first.cookies() if c["name"] == COOKIE) == token_a
        assert len(server.sessions.rows) == 2
    finally:
        first.close()
        second.close()
