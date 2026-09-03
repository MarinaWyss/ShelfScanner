"""The whole 005 flow in a real browser, against the fakes: preferences with an export, a photo,
the stages through choosing, five picks; save two, unsave one, mark one not for me; the rows in
the fake store and the saved list page agree."""

from pathlib import Path

from playwright.sync_api import Page, expect

from shelfscanner.web.fakes import DEFAULT_PICKS
from tests.e2e.conftest import Server, pick
from tests.web_images import small_jpeg

FIXTURE = Path("tests/fixtures/goodreads_sample.csv")


def test_preferences_scan_save_unsave_mark_and_the_saved_list(server: Server, page: Page):
    # First visit: the preferences page. Two genres, a line, the export.
    page.goto(f"{server.url}/scan")
    expect(page).to_have_url(f"{server.url}/preferences")
    page.check("input[name=genres][value='Science Fiction']")
    page.check("input[name=genres][value='Horror']")
    page.fill("input[name=authors]", "Ursula K. Le Guin, Shirley Jackson")
    page.fill("textarea[name=free_text]", "Short and strange.")
    page.set_input_files("input[name=goodreads]", {"name": "goodreads_library_export.csv", "mimeType": "text/csv",
                                                   "buffer": FIXTURE.read_bytes()})
    page.click("#prefs-save")
    expect(page).to_have_url(f"{server.url}/scan")

    (prefs,) = server.pipeline.prefs.values()
    assert prefs["genres"] == ["Science Fiction", "Horror"] and prefs["free_text"] == "Short and strange."
    assert prefs["authors"] == ["Ursula K. Le Guin", "Shirley Jackson"]
    assert len(prefs["rated_books"]) == 18 and len(prefs["to_read"]) == 7

    # The scan, through reading and choosing, to five picks.
    pick(page, small_jpeg())
    expect(page.locator("#scan-button")).to_be_enabled()
    page.click("#scan-button")
    expect(page.locator("#stage-choosing")).to_have_class("active", timeout=10_000)
    expect(page.locator("#stage-done")).to_have_class("done", timeout=10_000)
    expect(page.locator("#picks .pick")).to_have_count(5)
    expect(page.locator("#picks .pick-title")).to_have_text([p["title"] for p in DEFAULT_PICKS])
    (text,) = server.pipeline.client.inputs
    assert "Genres: Science Fiction, Horror" in text and "Favourite authors: Ursula K. Le Guin, Shirley Jackson" in text and "The Salt Road" in text, "the model saw the preferences"
    rid = int(page.locator("#picks").get_attribute("data-recommendation-id"))

    # Save two, unsave one, mark one.
    actions = lambda i: page.locator(f"#pick-actions-{rid}-{i}")  # noqa: E731
    actions(0).get_by_role("button", name="Save").click()
    expect(actions(0)).to_have_attribute("data-saved", "true")
    actions(2).get_by_role("button", name="Save").click()
    expect(actions(2)).to_have_attribute("data-saved", "true")
    actions(2).get_by_role("button", name="Saved").click()
    expect(actions(2)).to_have_attribute("data-saved", "false")
    actions(4).get_by_role("button", name="Not for me").click()
    expect(actions(4)).to_have_attribute("data-not-for-me", "true")
    expect(actions(4)).to_contain_text("Marked not for me")

    rows = server.pipeline.saved_rows
    assert [(r["recommendation_id"], r["pick_index"], r["removed_at"] is None) for r in rows] == [
        (rid, 0, True), (rid, 2, False)]
    assert [(r["recommendation_id"], r["pick_index"], r["kind"]) for r in server.pipeline.feedback_rows] == [
        (rid, 4, "not_for_me")]

    # A reload shows the same state (F1: saved picks survive a reload).
    page.reload()
    expect(page.locator("#scan-form")).to_be_visible()
    page.goto(f"{server.url}/saved")
    expect(page.locator(".saved-pick")).to_have_count(1)
    expect(page.locator(".saved-pick .pick-title")).to_have_text(DEFAULT_PICKS[0]["title"])
    expect(page.locator(".saved-pick .scanned")).to_contain_text("Scanned")

    # Unsave from the list removes it there and in the rows.
    page.locator(".saved-pick").get_by_role("button", name="Remove").click()
    expect(page.locator(".saved-pick")).to_have_count(0)
    assert all(r["removed_at"] is not None for r in server.pipeline.saved_rows)
    page.reload()
    expect(page.locator("#saved-empty")).to_be_visible()


def test_a_skipped_first_visit_still_gets_five_picks(server: Server, page: Page):
    page.goto(f"{server.url}/scan")
    page.click("#prefs-skip button")
    expect(page).to_have_url(f"{server.url}/scan")
    pick(page, small_jpeg())
    expect(page.locator("#scan-button")).to_be_enabled()
    page.click("#scan-button")
    expect(page.locator("#picks .pick")).to_have_count(5, timeout=15_000)
    (text,) = server.pipeline.client.inputs
    assert "taste is unknown" in text
    page.click("nav a[href='/preferences']")
    expect(page.locator("#prefs-form")).to_be_visible()
    expect(page.locator("#prefs-skip")).to_have_count(0)
