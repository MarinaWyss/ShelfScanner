"""The dashboard in a real browser (009): a scan through the app, then `/admin?key=` shows the
seven-day table with that scan in it, the window links work off the cookie, and the page is a 404
without the key."""

from playwright.sync_api import Page, expect

from shelfscanner.web import admin
from tests.e2e.conftest import Server, open_scan_page, pick
from tests.web_images import small_jpeg

SECRET = "e2e-admin-secret"


def test_admin_page_shows_the_seven_day_table(server: Server, page: Page, monkeypatch):
    monkeypatch.setenv(admin.SECRET_ENV, SECRET)  # the server thread reads the same environment

    open_scan_page(page, server.url)
    pick(page, small_jpeg())
    expect(page.locator("#scan-button")).to_be_enabled()
    page.click("#scan-button")
    expect(page.locator("#picks .pick")).to_have_count(5, timeout=15_000)

    page.goto(f"{server.url}/admin?key={SECRET}")
    table = page.locator("#overview")
    expect(table).to_be_visible()
    expect(table).to_have_attribute("data-window", "7")
    expect(page.locator(".lede")).to_contain_text("Last 7 days")
    first = table.locator("tbody tr").first
    expect(first).to_contain_text("Scans started")
    expect(first.locator("td").nth(1)).to_have_text("1")
    expect(page.locator("#spark-scans polyline")).to_have_count(1)
    expect(page.locator("#prices")).to_contain_text("Model prices")

    page.click(".windows a[href='/admin?window=30']")
    expect(page.locator("#overview")).to_have_attribute("data-window", "30")

    page.context.clear_cookies()
    response = page.goto(f"{server.url}/admin")
    assert response is not None and response.status == 404
