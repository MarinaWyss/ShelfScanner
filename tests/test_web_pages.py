"""013: the privacy policy, the terms and the contact page are static and unsessioned; the footer
with their links is on every page; the Support links open the PayPal page in a new tab."""

from html import escape

from fastapi.testclient import TestClient

from shelfscanner.web.app import DONATE_URL, create_app
from shelfscanner.web.fakes import FakeClient, FakePipeline, MemorySessions
from tests.test_web_scan import events_of, post_photo
from tests.web_images import small_jpeg

SUPPORT = f'href="{escape(DONATE_URL)}" target="_blank" rel="noopener noreferrer"'  # Jinja escapes the &s


def make_client() -> tuple[TestClient, MemorySessions, FakePipeline]:
    store, pipeline = MemorySessions(), FakePipeline()
    return TestClient(create_app(pipeline=pipeline, sessions=store)), store, pipeline


def test_the_three_pages_render_and_make_no_session():
    client, store, _ = make_client()
    for path, text in [("/privacy-policy", "Privacy Policy"), ("/terms-conditions", "Terms &amp; Conditions"),
                       ("/contact", "Contact Us")]:
        res = client.get(path)
        assert res.status_code == 200 and f"<h1 class=\"page-title\">{text}</h1>" in res.text, path
        assert "Last updated: September 3, 2026" in res.text or path == "/contact"
        assert "set-cookie" not in res.headers, path
    assert store.rows == {}


def test_the_privacy_policy_says_what_the_app_does():
    client, _, _ = make_client()
    text = client.get("/privacy-policy").text
    for fact in ["shelfscanner_session", "30 days", "Open Library", "Google (Gemini)", "Anthropic (Claude)", "OpenAI (GPT)",
                 "read once and not kept", "Vercel", "Supabase", "Google Fonts", "no affiliate link"]:
        assert fact in text, fact


def test_the_contact_form_is_a_mailto_and_posts_nothing_here():
    client, _, _ = make_client()
    text = client.get("/contact").text
    assert 'id="contact-form" action="mailto:shelfscannerapp@gmail.com" method="post" enctype="text/plain"' in text
    assert 'name="name"' in text and 'name="email"' in text and 'name="message"' in text
    assert 'href="mailto:shelfscannerapp@gmail.com">shelfscannerapp@gmail.com</a>' in text
    assert client.post("/contact", data={"name": "a", "email": "a@b.c", "message": "hi"}).status_code == 405


def test_the_footer_and_the_support_links_are_on_every_page():
    client, _, _ = make_client()
    for path in ["/", "/books", "/reading-list", "/privacy-policy"]:
        text = client.get(path).text
        assert 'href="/privacy-policy">Privacy Policy</a>' in text and 'href="/terms-conditions">Terms &amp; Conditions</a>' in text, path
        assert 'href="/contact">Contact</a>' in text and text.count(SUPPORT) == 2, path  # the drawer and the footer
        assert '<a class="icon-btn" href="/contact"' in text, path  # the top bar's Contact goes to the page now
    assert client.get("/").text.count("All rights reserved") == 1  # the homepage no longer carries its own footer


def test_the_support_card_follows_the_picks_and_not_an_empty_result():
    client, _, _ = make_client()
    scan_id = post_photo(client, small_jpeg()).json()["id"]
    done = events_of(client, scan_id)[4][1]
    assert done.index("Scan More Books") < done.index('id="support"')
    assert "Found the perfect book?" in done and f'class="btn support" {SUPPORT}' in done
    client = TestClient(create_app(pipeline=FakePipeline(FakeClient(parsed={"books": []})), sessions=MemorySessions()))
    scan_id = post_photo(client, small_jpeg()).json()["id"]
    done = [body for name, body in events_of(client, scan_id) if name == "done"][0]
    assert "Unable to detect any books" in done and 'id="support"' not in done
