"""The scan endpoints (003 task 2, 005 task 3) against the fake pipeline and a fake model client.

Covers the metadata strip, the photos row, the events through reading and
choosing, the result with five picks, and the error paths naming their stage.
Nothing here reaches Supabase or a provider.
"""

import io

from fastapi.testclient import TestClient
from PIL import Image

from shelfscanner.images import has_metadata
from shelfscanner.web.app import create_app
from shelfscanner.web.fakes import DEFAULT_PICKS, DEFAULT_TITLES, FakeClient, FakePipeline, MemorySessions
from shelfscanner.web.pipeline import UNKNOWN_TASTE
from shelfscanner.web.scan import MAX_BODY_BYTES
from tests.web_images import GPS_IFD, ROTATE_90_CW, jpeg_bytes, shelf_image, small_jpeg


def make_client(pipeline: FakePipeline | None = None) -> tuple[TestClient, FakePipeline]:
    pipeline = pipeline or FakePipeline()
    client = TestClient(create_app(pipeline=pipeline, sessions=MemorySessions()))
    return client, pipeline


def post_photo(client: TestClient, data: bytes, **kwargs):
    return client.post("/scan", files={"photo": ("shelf.jpg", data, "image/jpeg")}, **kwargs)


def events_of(client: TestClient, scan_id: int) -> list[tuple[str, str]]:
    with client.stream("GET", f"/scan/{scan_id}/events") as res:
        assert res.status_code == 200
        assert res.headers["content-type"].startswith("text/event-stream")
        text = "".join(res.iter_text())
    out = []
    for block in text.split("\n\n"):
        lines = block.splitlines()
        if not lines or lines[0].startswith(":"):
            continue
        assert lines[0].startswith("event: "), block
        out.append((lines[0][7:], "\n".join(line[6:] for line in lines[1:] if line.startswith("data: "))))
    return out


def test_scan_strips_metadata_applies_orientation_and_stores_the_row():
    client, pipeline = make_client()
    tagged = jpeg_bytes(shelf_image(400, 300), gps=True, orientation=ROTATE_90_CW)
    assert has_metadata(tagged)

    res = post_photo(client, tagged)
    assert res.status_code == 201
    scan_id = res.json()["id"]

    row = pipeline.photos[scan_id]
    assert row["session_id"] == 1 and row["titles"] == [] and row["storage_path"].startswith("sessions/1/")
    stored = pipeline.blobs[row["storage_path"]]
    assert not has_metadata(stored)
    with Image.open(io.BytesIO(stored)) as im:
        assert not im.getexif().get_ifd(GPS_IFD)
        assert im.size == (300, 400), "orientation applied to the pixels, tag dropped"


def test_scan_resizes_to_the_configured_long_edge():
    client, pipeline = make_client()
    res = post_photo(client, jpeg_bytes(shelf_image(2400, 1800)))
    stored = pipeline.blobs[pipeline.photos[res.json()["id"]]["storage_path"]]
    with Image.open(io.BytesIO(stored)) as im:
        assert max(im.size) == 1568


def test_events_stream_reading_then_choosing_then_five_picks():
    client, pipeline = make_client()
    scan_id = post_photo(client, small_jpeg()).json()["id"]
    assert client.get(f"/scan/{scan_id}").json() == {"id": scan_id, "status": "pending"}

    events = events_of(client, scan_id)
    assert [name for name, _ in events] == ["uploaded", "reading", "choosing", "done", "close"]
    assert 'data-stage="reading"' in events[1][1] and 'id="stage-reading" class="active"' in events[1][1]
    assert 'id="stage-reading" class="done"' in events[2][1] and 'id="stage-choosing" class="active"' in events[2][1]
    done = events[3][1]
    assert 'id="stage-done" class="done"' in done and "Five for you" in done
    assert done.count('class="pick"') == 5 and "Piranesi" in done and "Dune" in done
    assert 'hx-post="/picks/1/0/save"' in done and 'hx-post="/picks/1/0/not-for-me"' in done

    body = client.get(f"/scan/{scan_id}").json()
    assert body["status"] == "done" and body["titles"] == DEFAULT_TITLES and body["recommendation_id"] == 1
    assert [p["title"] for p in body["picks"]] == [p["title"] for p in DEFAULT_PICKS]
    assert all(p["saved"] is False and p["not_for_me"] is False and p["reason"] for p in body["picks"])
    assert [c[:2] for c in pipeline.client.calls] == [("vision", "gemini-flash"), ("text", "gpt-mini")]


def test_the_model_sees_the_shelf_and_the_sessions_preferences():
    client, pipeline = make_client()
    client.post("/preferences", data={"genres": ["Horror"], "free_text": "Short and eerie."})
    scan_id = post_photo(client, small_jpeg()).json()["id"]
    events_of(client, scan_id)
    (text,) = pipeline.client.inputs
    assert "- Dune" in text and "Genres: Horror" in text and "About the reader: Short and eerie." in text
    assert pipeline.recommendations[1]["preferences"]["genres"] == ["Horror"]


def test_a_scan_with_no_preferences_still_runs_and_says_taste_is_unknown():
    client, pipeline = make_client()
    scan_id = post_photo(client, small_jpeg()).json()["id"]
    events = events_of(client, scan_id)
    assert [name for name, _ in events] == ["uploaded", "reading", "choosing", "done", "close"]
    (text,) = pipeline.client.inputs
    assert UNKNOWN_TASTE in text
    assert pipeline.recommendations[1]["preferences"]["free_text"] == UNKNOWN_TASTE, "logged as sent"
    assert pipeline.prefs == {}, "nothing was stored for the session"


def test_reconnecting_replays_the_result_without_calling_any_model_again():
    client, pipeline = make_client()
    scan_id = post_photo(client, small_jpeg()).json()["id"]
    events_of(client, scan_id)
    again = events_of(client, scan_id)
    assert [name for name, _ in again] == ["done", "close"]
    assert len(pipeline.client.calls) == 2


def test_reconnecting_after_reading_only_runs_choosing():
    client, pipeline = make_client()
    scan_id = post_photo(client, small_jpeg()).json()["id"]
    pipeline.read(pipeline.photos[scan_id], lambda note: None)  # as if the stream broke after reading
    events = events_of(client, scan_id)
    assert [name for name, _ in events] == ["choosing", "done", "close"]
    assert [c[0] for c in pipeline.client.calls] == ["vision", "text"]


def test_model_failure_names_the_reading_stage():
    client, _ = make_client(FakePipeline(FakeClient(error="provider 503: overloaded")))
    scan_id = post_photo(client, small_jpeg()).json()["id"]
    events = events_of(client, scan_id)
    assert [name for name, _ in events] == ["uploaded", "reading", "failed", "close"]
    assert "Reading the shelf failed" in events[2][1] and "provider 503: overloaded" in events[2][1]
    assert 'id="stage-reading" class="failed"' in events[2][1] and 'id="stage-choosing" class="todo"' in events[2][1]
    body = client.get(f"/scan/{scan_id}").json()
    assert body["status"] == "failed" and body["stage"] == "reading" and "503" in body["error"]


def test_model_failure_names_the_choosing_stage():
    client, pipeline = make_client(FakePipeline(FakeClient(text_error="http 429: rate limited")))
    scan_id = post_photo(client, small_jpeg()).json()["id"]
    events = events_of(client, scan_id)
    assert [name for name, _ in events] == ["uploaded", "reading", "choosing", "failed", "close"]
    assert "Choosing failed" in events[3][1] and "429" in events[3][1]
    assert 'id="stage-reading" class="done"' in events[3][1] and 'id="stage-choosing" class="failed"' in events[3][1]
    body = client.get(f"/scan/{scan_id}").json()
    assert body["status"] == "failed" and body["stage"] == "choosing" and "429" in body["error"]
    assert pipeline.recommendations[1]["error"] == "http 429: rate limited", "the failed run is still logged"
    assert [name for name, _ in events_of(client, scan_id)] == ["failed", "close"], "a failed choosing is not retried"


def test_no_titles_read_means_done_without_choosing():
    client, pipeline = make_client(FakePipeline(FakeClient(parsed={"books": []})))
    scan_id = post_photo(client, small_jpeg()).json()["id"]
    events = events_of(client, scan_id)
    assert [name for name, _ in events] == ["uploaded", "reading", "done", "close"]
    assert "No titles could be read" in events[2][1]
    assert [c[0] for c in pipeline.client.calls] == ["vision"]
    assert client.get(f"/scan/{scan_id}").json() == {"id": scan_id, "status": "done", "titles": [],
                                                     "recommendation_id": None, "picks": []}


def test_store_failure_names_the_upload_stage():
    client, _ = make_client(FakePipeline(fail_store="bucket unreachable"))
    res = post_photo(client, small_jpeg())
    assert res.status_code == 500
    assert res.json()["stage"] == "uploading" and "Uploading the photo failed" in res.json()["error"]
    html = post_photo(client, small_jpeg(), headers={"HX-Request": "true"})
    assert html.status_code == 500 and "Uploading the photo failed" in html.text and 'data-stage="uploading"' in html.text


def test_body_over_four_megabytes_is_refused_with_a_message():
    client, pipeline = make_client()
    res = post_photo(client, b"\xff\xd8" + b"\0" * (MAX_BODY_BYTES + 1))
    assert res.status_code == 413
    assert "over 4 MB" in res.json()["error"] and res.json()["stage"] == "uploading"
    assert pipeline.photos == {}


def test_non_image_is_refused():
    client, _ = make_client()
    res = post_photo(client, b"definitely not a jpeg")
    assert res.status_code == 400
    assert "not an image" in res.json()["error"]


def test_a_scan_is_only_visible_to_its_own_session():
    store = MemorySessions()
    pipeline = FakePipeline()
    app = create_app(pipeline=pipeline, sessions=store)
    owner, other = TestClient(app), TestClient(app)
    scan_id = post_photo(owner, small_jpeg()).json()["id"]
    assert other.get(f"/scan/{scan_id}").status_code == 404
    assert other.get(f"/scan/{scan_id}/events").status_code == 404
    assert owner.get(f"/scan/{scan_id}").status_code == 200


def test_htmx_requests_get_fragments():
    client, _ = make_client()
    res = post_photo(client, small_jpeg(), headers={"HX-Request": "true"})
    assert res.status_code == 201
    scan_id = res.text.split('data-scan-id="')[1].split('"')[0]
    assert f'sse-connect="/scan/{scan_id}/events"' in res.text and 'sse-close="close"' in res.text
    assert "choosing" in res.text.split("sse-swap=")[1].split('"')[1]
    assert 'id="stage-uploaded" class="done"' in res.text
    events_of(client, int(scan_id))
    done = client.get(f"/scan/{scan_id}", headers={"HX-Request": "true"})
    assert "sse-connect" not in done.text and "Piranesi" in done.text and done.text.count('class="pick"') == 5


def test_index_page_has_the_picker_the_scripts_and_the_links():
    client, _ = make_client()
    assert client.get("/", follow_redirects=False).status_code == 302, "first visit goes to preferences"
    client.post("/preferences", data={"action": "skip"})
    res = client.get("/")
    assert res.status_code == 200
    assert 'name="photo"' in res.text and 'hx-post="/scan"' in res.text and "/static/app.js" in res.text
    assert 'href="/saved"' in res.text and 'href="/preferences"' in res.text
