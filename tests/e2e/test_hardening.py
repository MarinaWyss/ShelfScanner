"""008 in a real browser, against the fakes: the N+1th scan in an hour is refused with the number, a
provider failure after failover names the stage and offers a retry that starts a new scan, and an
oversized or non-image upload is refused before anything is stored."""

from playwright.sync_api import Page, expect

from shelfscanner.web.scan import MAX_BODY_BYTES
from tests.e2e.conftest import Server, open_scan_page, pick
from tests.web_images import small_jpeg


def scan_once(page: Page) -> None:
    pick(page, small_jpeg())
    expect(page.locator("#scan-button")).to_be_enabled()
    page.click("#scan-button")


def test_the_third_scan_in_an_hour_is_refused_with_the_number(limited_server: Server, page: Page):
    open_scan_page(page, limited_server.url)
    for _ in range(2):
        scan_once(page)
        expect(page.locator("#picks")).to_be_visible(timeout=15_000)
        page.get_by_role("link", name="Scan More Books").click()  # 014: the result takes the form's place
        expect(page.locator("#scan-form")).to_be_visible()
    scan_once(page)
    error = page.locator("#scan-error")
    expect(error).to_be_visible(timeout=10_000)
    expect(error).to_contain_text("Scan limit reached")
    expect(error).to_contain_text("2 shelves in the last hour")
    expect(error).to_contain_text("limit is 2 per hour")
    expect(error).to_have_attribute("data-stage", "rate")
    assert len(limited_server.pipeline.photos) == 2, "the refused scan stored nothing"
    assert len(limited_server.pipeline.client.calls) == 4, "and called no model"


def test_provider_failure_after_failover_names_the_stage_and_retries_as_a_new_scan(server: Server, page: Page):
    server.pipeline.client.error = "http 503: overloaded"  # a provider error: fails over, and the fallback fails too
    open_scan_page(page, server.url)
    scan_once(page)
    error = page.locator("#scan-error")
    expect(error).to_contain_text("Reading the shelf failed", timeout=15_000)
    expect(error).to_contain_text("Both models failed")
    expect(error).to_contain_text("google/gemini-3.8-flash: http 503")
    expect(error).to_contain_text("anthropic/claude-sonnet-5: http 503")
    expect(page.locator("#stage-reading")).to_have_class("failed")
    expect(page.locator("#stage-checking")).to_have_class("todo")
    assert [c[:2] for c in server.pipeline.client.calls] == [("vision", "gemini-flash"), ("vision", "sonnet")]
    assert list(server.pipeline.photos.values())[0]["status"] == "failed"

    # The retry: the provider is back; the same photo goes through as a new scan.
    server.pipeline.client.error = None
    expect(page.locator("#scan-retry")).to_be_visible()
    page.click("#scan-retry")
    expect(page.locator("#stage-reading")).to_have_class("active", timeout=10_000)
    expect(page.locator("#picks")).to_be_visible(timeout=15_000)
    assert len(server.pipeline.photos) == 2, "a new scan, not the old one again"
    assert [p["status"] for p in server.pipeline.photos.values()] == ["failed", "done"]


def test_an_oversized_or_non_image_upload_is_refused(server: Server, page: Page):
    open_scan_page(page, server.url)
    # Not an image the browser can shrink, so the original is sent; the server refuses it on size alone.
    pick(page, b"\xff\xd8" + b"\0" * (MAX_BODY_BYTES + 1), name="huge.jpg")
    expect(page.locator("#scan-button")).to_be_enabled(timeout=15_000)
    page.click("#scan-button")
    error = page.locator("#scan-error")
    expect(error).to_contain_text("Upload refused", timeout=15_000)
    expect(error).to_contain_text("over 4 MB")
    expect(error).to_have_attribute("data-stage", "uploading")

    pick(page, b"Dune\nPiranesi\n", name="titles.txt", mime_type="text/plain")
    expect(page.locator("#scan-button")).to_be_enabled(timeout=15_000)
    page.click("#scan-button")
    expect(error).to_contain_text("text/plain", timeout=15_000)
    expect(error).to_contain_text("Choose a JPEG or PNG")
    assert server.pipeline.photos == {}, "nothing reached the store"
    assert server.pipeline.client.calls == []
