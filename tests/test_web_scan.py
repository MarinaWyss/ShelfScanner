"""The scan endpoints (003 task 2, 005 task 3) against the fake pipeline and a fake model client.

Covers the metadata strip, the photos row, the events through reading and
choosing, the result with five picks, and the error paths naming their stage.
Nothing here reaches Supabase or a provider.
"""

import io
import threading
import time
from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from PIL import Image

from shelfscanner.images import has_metadata
from shelfscanner.web import scan
from shelfscanner.web.app import create_app
from shelfscanner.web.fakes import DEFAULT_PICKS, DEFAULT_TITLES, FakeClient, FakePipeline, MemorySessions
from shelfscanner.web.pipeline import UNKNOWN_TASTE, Reading
from shelfscanner.web.scan import MAX_BODY_BYTES, MIN_LONG_EDGE
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
    assert [name for name, _ in events] == ["uploaded", "reading", "checking", "choosing", "done", "close"]
    assert 'data-stage="reading"' in events[1][1] and 'id="stage-reading" class="active"' in events[1][1]
    assert 'id="stage-reading" class="done"' in events[2][1] and 'id="stage-checking" class="active"' in events[2][1]
    assert 'id="stage-checking" class="done"' in events[3][1] and 'id="stage-choosing" class="active"' in events[3][1]
    done = events[4][1]
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
    assert [name for name, _ in events] == ["uploaded", "reading", "checking", "choosing", "done", "close"]
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
    assert [name for name, _ in events] == ["checking", "choosing", "done", "close"]
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
    # An `http` error is a provider failure, so the stage fails over (002 D8); the fake fails there too. The
    # choosing frames are the primary's call, the failover note and the fallback's call.
    names = [name for name, _ in events]
    assert names[:3] == ["uploaded", "reading", "checking"] and names[-2:] == ["failed", "close"]
    assert set(names[3:-2]) == {"choosing"} and len(names) == 8
    assert any("gpt-mini failed" in data and "trying haiku" in data for name, data in events if name == "choosing")
    failed = events[-2][1]
    assert "Choosing failed" in failed and "429" in failed and "Both models failed" in failed
    assert 'id="stage-reading" class="done"' in failed and 'id="stage-choosing" class="failed"' in failed
    assert 'id="scan-retry"' in failed, "a retry is offered"
    body = client.get(f"/scan/{scan_id}").json()
    assert body["status"] == "failed" and body["stage"] == "choosing" and "429" in body["error"]
    assert pipeline.recommendations[1]["error"] == "http 429: rate limited", "the failed run is still logged"
    assert pipeline.recommendations[1]["failover_from"] == "openai/gpt-5.4-mini"
    assert [name for name, _ in events_of(client, scan_id)] == ["failed", "close"], "a failed choosing is not retried"
    assert pipeline.photos[scan_id]["status"] == "failed"


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
    assert 'id="scan-retry"' in html.text, "a store failure offers a retry"


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


# --- change 008: the stage lock, the failover message, the checking step, validation ------------------


def test_status_follows_the_stages_and_resized_by_client_is_stored():
    client, pipeline = make_client()
    scan_id = client.post("/scan", files={"photo": ("shelf.jpg", small_jpeg(), "image/jpeg")},
                          data={"resized": "1"}).json()["id"]
    assert pipeline.photos[scan_id]["status"] == "pending" and pipeline.photos[scan_id]["resized_by_client"] is True
    events_of(client, scan_id)
    assert pipeline.photos[scan_id]["status"] == "done"
    other = post_photo(client, small_jpeg()).json()["id"]
    assert pipeline.photos[other]["resized_by_client"] is False, "the default is the server-resize fallback"

    client, pipeline = make_client(FakePipeline(FakeClient(error="provider 503: overloaded")))
    scan_id = post_photo(client, small_jpeg()).json()["id"]
    events_of(client, scan_id)
    assert pipeline.photos[scan_id]["status"] == "failed"


def test_a_second_connection_while_reading_is_in_flight_waits_instead_of_reading_again(monkeypatch):
    monkeypatch.setattr(scan, "POLL_S", 0.01)
    client, pipeline = make_client()
    scan_id = post_photo(client, small_jpeg()).json()["id"]
    photo = pipeline.photos[scan_id]
    # Another connection holds the reading: a fresh claim and no extraction yet.
    photo["status"], photo["status_at"] = "reading", datetime.now(UTC)

    def other_connection_finishes_reading():
        time.sleep(0.15)
        pipeline.readings[scan_id] = Reading(titles=list(DEFAULT_TITLES), extraction_id=scan_id, model="fake")

    threading.Thread(target=other_connection_finishes_reading).start()
    events = events_of(client, scan_id)
    # Waited (the reading panel with the note), then claimed the choosing itself once the reading was there.
    assert [name for name, _ in events] == ["reading", "checking", "choosing", "done", "close"]
    assert scan.IN_FLIGHT_NOTE in events[0][1]
    assert [c[0] for c in pipeline.client.calls] == ["text"], "the vision model was not called a second time"
    assert pipeline.photos[scan_id]["status"] == "done"


def test_a_stale_reading_claim_is_taken_over():
    client, pipeline = make_client()
    scan_id = post_photo(client, small_jpeg()).json()["id"]
    photo = pipeline.photos[scan_id]
    photo["status"], photo["status_at"] = "reading", datetime.now(UTC) - timedelta(minutes=4)
    events = events_of(client, scan_id)
    assert [name for name, _ in events] == ["uploaded", "reading", "checking", "choosing", "done", "close"]
    assert [c[0] for c in pipeline.client.calls] == ["vision", "text"]


def test_a_stale_choosing_claim_is_taken_over_but_a_fresh_one_is_waited_for(monkeypatch):
    monkeypatch.setattr(scan, "POLL_S", 0.01)
    client, pipeline = make_client()
    scan_id = post_photo(client, small_jpeg()).json()["id"]
    pipeline.read(pipeline.photos[scan_id], lambda note: None)
    photo = pipeline.photos[scan_id]
    photo["status"], photo["status_at"] = "choosing", datetime.now(UTC)

    def other_connection_finishes_choosing():
        time.sleep(0.15)
        pipeline.choose(photo, pipeline.readings[scan_id], {}, lambda note: None)
        pipeline.set_status(scan_id, "done", datetime.now(UTC))

    threading.Thread(target=other_connection_finishes_choosing).start()
    events = events_of(client, scan_id)
    assert [name for name, _ in events] == ["choosing", "done", "close"]
    assert [c[0] for c in pipeline.client.calls] == ["vision", "text"], "one choosing, run by the other connection"

    photo["status"], photo["status_at"] = "choosing", datetime.now(UTC) - timedelta(minutes=4)
    del pipeline.choosings[scan_id]
    events = events_of(client, scan_id)
    assert [name for name, _ in events] == ["checking", "choosing", "done", "close"]
    assert [c[0] for c in pipeline.client.calls] == ["vision", "text", "text"], "the stale claim was taken over"


def test_provider_failure_after_failover_names_both_attempts_and_offers_a_retry():
    client, pipeline = make_client(FakePipeline(FakeClient(error="http 503: overloaded")))
    scan_id = post_photo(client, small_jpeg()).json()["id"]
    events = events_of(client, scan_id)
    assert [name for name, _ in events] == ["uploaded", "reading", "reading", "failed", "close"]
    assert "gemini-flash failed" in events[2][1] and "trying sonnet" in events[2][1]
    failed = events[3][1]
    assert "Reading the shelf failed" in failed and 'id="scan-retry"' in failed
    assert "Both models failed" in failed and "google/gemini-3.8-flash: http 503" in failed
    assert "Then anthropic/claude-sonnet-5: http 503" in failed
    assert [c[:2] for c in pipeline.client.calls] == [("vision", "gemini-flash"), ("vision", "sonnet")]
    body = client.get(f"/scan/{scan_id}").json()
    assert body["stage"] == "reading" and "Both models failed" in body["error"]
    assert pipeline.readings[scan_id].failover_from == "google/gemini-3.8-flash"


def test_checking_failure_is_named_as_its_own_stage():
    client, pipeline = make_client()
    pipeline.drop_all_titles = True
    scan_id = post_photo(client, small_jpeg()).json()["id"]
    events = events_of(client, scan_id)
    assert [name for name, _ in events] == ["uploaded", "reading", "checking", "failed", "close"]
    failed = events[3][1]
    assert "Checking the titles failed" in failed and "none of the 7 titles read matched" in failed
    assert 'id="stage-checking" class="failed"' in failed and 'id="stage-choosing" class="todo"' in failed
    assert 'data-stage="checking"' in failed and 'id="scan-retry"' in failed
    body = client.get(f"/scan/{scan_id}").json()
    assert body["status"] == "failed" and body["stage"] == "checking"
    assert [c[0] for c in pipeline.client.calls] == ["vision"]
    assert pipeline.photos[scan_id]["status"] == "failed"


def test_uploads_must_be_jpeg_or_png_by_type_and_by_content():
    client, pipeline = make_client()
    png = io.BytesIO()
    shelf_image(640, 480).save(png, format="PNG")
    assert client.post("/scan", files={"photo": ("shelf.png", png.getvalue(), "image/png")}).status_code == 201

    gif = io.BytesIO()
    shelf_image(640, 480).save(gif, format="GIF")
    res = client.post("/scan", files={"photo": ("shelf.gif", gif.getvalue(), "image/gif")})
    assert res.status_code == 400 and "image/gif" in res.json()["error"] and "JPEG or PNG" in res.json()["error"]

    res = client.post("/scan", files={"photo": ("shelf.jpg", gif.getvalue(), "image/jpeg")})
    assert res.status_code == 400 and "a GIF" in res.json()["error"], "the bytes, not the declared type, decide"

    res = client.post("/scan", files={"photo": ("notes.txt", b"hello", "text/plain")})
    assert res.status_code == 400 and "text/plain" in res.json()["error"]
    assert len(pipeline.photos) == 1, "only the PNG was stored"


def test_a_photo_under_the_minimum_long_edge_is_refused():
    client, pipeline = make_client()
    res = post_photo(client, small_jpeg(300, 200))
    assert res.status_code == 400
    assert "300×200" in res.json()["error"] and f"{MIN_LONG_EDGE} px" in res.json()["error"]
    assert res.json()["stage"] == "uploading"
    assert post_photo(client, small_jpeg(200, MIN_LONG_EDGE)).status_code == 201, "the long edge counts, whichever way"
    assert len(pipeline.photos) == 1


def test_refusals_as_fragments_carry_the_title_and_the_stage():
    client, _ = make_client()
    res = post_photo(client, small_jpeg(300, 200), headers={"HX-Request": "true"})
    assert res.status_code == 400 and "Upload refused" in res.text and 'data-stage="uploading"' in res.text
    assert 'id="scan-retry"' not in res.text, "a bad photo wants a different photo, not the same one again"
