"""The preferences page (005 task 2): genres, free text and a Goodreads export, written through the
importer to the session's row; the export itself is never kept."""

from pathlib import Path

from fastapi.testclient import TestClient

from shelfscanner import preferences
from shelfscanner.web.app import create_app
from shelfscanner.web.fakes import FakePipeline, MemorySessions
from shelfscanner.web.prefs import GENRES

FIXTURE = Path("tests/fixtures/goodreads_sample.csv")


def make_client() -> tuple[TestClient, FakePipeline]:
    pipeline = FakePipeline()
    return TestClient(create_app(pipeline=pipeline, sessions=MemorySessions())), pipeline


def test_first_visit_lands_on_step_one_with_the_originals_eighteen_genres():
    client, _ = make_client()
    res = client.get("/books/upload")
    assert res.status_code == 200 and str(res.url).endswith("/books"), "step 2 without preferences goes back to step 1"
    assert len(GENRES) == 18 and GENRES[0] == "Fiction" and "Comics" in GENRES  # 012 D4: the original's list
    assert all(f'value="{g}"' in res.text.replace("&amp;", "&") for g in GENRES)
    assert 'name="goodreads"' in res.text and 'name="authors"' in res.text and 'id="author-input"' in res.text
    assert 'data-step="1"' in res.text and "Continue" in res.text


def test_genres_and_free_text_are_stored_as_the_object_and_shown_again():
    client, pipeline = make_client()
    res = client.post("/preferences", data={"genres": ["Science Fiction", "Horror"], "free_text": " Voice matters. "},
                      follow_redirects=False)
    assert res.status_code == 303 and res.headers["location"] == "/books/upload"
    assert pipeline.prefs[1] == {**preferences.empty(), "genres": ["Science Fiction", "Horror"], "free_text": "Voice matters."}

    page = client.get("/preferences").text
    assert 'value="Horror" checked' in page and 'value="Fantasy">' in page
    assert "Voice matters." not in page, "014: the page has no free-text field (v1 had none); the object keeps the key"
    assert client.get("/books/upload").status_code == 200 and 'hx-post="/scan"' in client.get("/books/upload").text


def test_favorite_authors_round_trip_as_a_list():
    # 012 D2: a comma-separated field, stored as the object's `authors` list, shown back joined.
    client, pipeline = make_client()
    client.post("/preferences", data={"authors": " Ursula K. Le Guin ,Hilary Mantel,, ursula k. le guin\nOctavia Butler "})
    assert pipeline.prefs[1]["authors"] == ["Ursula K. Le Guin", "Hilary Mantel", "Octavia Butler"]
    # 014: what is still typed in the box when Continue is pressed counts too.
    client.post("/preferences", data={"authors": "Ursula K. Le Guin", "authors_extra": " N. K. Jemisin "})
    assert pipeline.prefs[1]["authors"] == ["Ursula K. Le Guin", "N. K. Jemisin"]
    client.post("/preferences", data={"authors": " Ursula K. Le Guin ,Hilary Mantel,, ursula k. le guin\nOctavia Butler "})
    page = client.get("/preferences").text
    assert 'value="Ursula K. Le Guin, Hilary Mantel, Octavia Butler"' in page
    client.post("/preferences", data={"authors": ""})
    assert pipeline.prefs[1]["authors"] == []


def test_a_stored_genre_off_the_list_stays_chosen_with_its_own_chip():
    # 012: an object saved with the older list, or by the CLI, loses nothing.
    client, pipeline = make_client()
    client.get("/books", follow_redirects=False)
    pipeline.prefs[1] = {**preferences.empty(), "genres": ["Horror", "Essays & ideas"]}
    page = client.get("/preferences").text.replace("&amp;", "&")
    assert 'value="Horror" checked' in page and 'value="Essays & ideas" checked' in page
    assert page.count('name="genres"') == 19


def test_skip_stores_an_empty_object_so_the_page_is_not_shown_again():
    client, pipeline = make_client()
    res = client.post("/preferences", data={"action": "skip"}, follow_redirects=False)
    assert res.status_code == 303
    assert pipeline.prefs[1] == preferences.empty()
    assert client.get("/books/upload", follow_redirects=False).status_code == 200


def test_goodreads_export_goes_through_the_importer_and_is_not_kept():
    client, pipeline = make_client()
    csv_bytes = FIXTURE.read_bytes()
    res = client.post("/preferences", data={"genres": ["Fantasy"], "free_text": "Big ideas."},
                      files={"goodreads": ("goodreads_library_export.csv", csv_bytes, "text/csv")}, follow_redirects=False)
    assert res.status_code == 303
    stored = pipeline.prefs[1]
    expected = preferences.build(preferences.read_export(FIXTURE), genres=["Fantasy"], free_text="Big ideas.")
    assert stored == expected
    assert len(stored["rated_books"]) == 18 and len(stored["to_read"]) == 7 and len(stored["avoid"]) == 2
    assert "did not finish" in stored["avoid"][0]
    assert not any(isinstance(v, (bytes, bytearray)) for v in stored.values())
    assert "1001" not in repr(pipeline.prefs), "no Goodreads ids, no raw rows"

    page = client.get("/preferences").text
    assert "18 rated books and 7 to-read titles are on file" in page


def test_editing_genres_later_keeps_the_imported_history():
    client, pipeline = make_client()
    client.post("/preferences", data={}, files={"goodreads": ("export.csv", FIXTURE.read_bytes(), "text/csv")})
    client.post("/preferences", data={"genres": ["History"], "free_text": "Less fiction lately."})
    stored = pipeline.prefs[1]
    assert stored["genres"] == ["History"] and stored["free_text"] == "Less fiction lately."
    assert len(stored["rated_books"]) == 18 and len(stored["to_read"]) == 7


def test_a_second_export_replaces_the_first():
    client, pipeline = make_client()
    client.post("/preferences", data={}, files={"goodreads": ("export.csv", FIXTURE.read_bytes(), "text/csv")})
    head = FIXTURE.read_text(encoding="utf-8-sig").splitlines()[:3]
    client.post("/preferences", data={}, files={"goodreads": ("export.csv", "\n".join(head).encode(), "text/csv")})
    assert len(pipeline.prefs[1]["rated_books"]) == 2 and pipeline.prefs[1]["avoid"] == []


def test_a_file_that_is_not_an_export_is_refused_and_nothing_changes():
    client, pipeline = make_client()
    res = client.post("/preferences", data={"genres": ["Horror"]},
                      files={"goodreads": ("notes.csv", b"a,b\n1,2\n", "text/csv")})
    assert res.status_code == 400
    assert 'id="prefs-error"' in res.text and "not a Goodreads export" in res.text
    assert pipeline.prefs == {}


def test_an_empty_file_field_means_no_export():
    client, pipeline = make_client()
    res = client.post("/preferences", data={"genres": ["Horror"]}, files={"goodreads": ("", b"", "application/octet-stream")},
                      follow_redirects=False)
    assert res.status_code == 303
    assert pipeline.prefs[1]["genres"] == ["Horror"] and pipeline.prefs[1]["rated_books"] == []


def test_preferences_are_per_session():
    store = MemorySessions()
    pipeline = FakePipeline()
    app = create_app(pipeline=pipeline, sessions=store)
    a, b = TestClient(app), TestClient(app)
    a.post("/preferences", data={"genres": ["Horror"]})
    assert b.get("/books/upload", follow_redirects=False).status_code == 302
    assert list(pipeline.prefs) == [1]
