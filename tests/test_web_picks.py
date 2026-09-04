"""Save and feedback (005 task 4): rows tied to the recommendation row and the pick's position, the
saved list, and the metric computed from the rows."""

from fastapi.testclient import TestClient

from shelfscanner.web import metrics
from shelfscanner.web.app import create_app
from shelfscanner.web.fakes import DEFAULT_PICKS, FakeClient, FakePipeline, MemorySessions
from shelfscanner.web.picks import scan_date
from shelfscanner.web.pipeline import Pick, SavedPick
from tests.test_web_scan import events_of, post_photo
from tests.web_images import small_jpeg


def make_client(pipeline: FakePipeline | None = None) -> tuple[TestClient, FakePipeline]:
    pipeline = pipeline or FakePipeline()
    return TestClient(create_app(pipeline=pipeline, sessions=MemorySessions())), pipeline


def scan(client: TestClient) -> int:
    """Run a scan to completion; return its recommendation id."""
    scan_id = post_photo(client, small_jpeg()).json()["id"]
    events_of(client, scan_id)
    return client.get(f"/scan/{scan_id}").json()["recommendation_id"]


def test_save_writes_a_row_joined_to_the_recommendation_and_unsave_keeps_the_history():
    client, pipeline = make_client()
    rid = scan(client)
    res = client.post(f"/picks/{rid}/2/save")
    assert res.status_code == 200
    assert res.json() == {"recommendation_id": rid, "pick_index": 2, "saved": True, "not_for_me": False}
    (row,) = pipeline.saved_rows
    assert row["session_id"] == 1 and row["recommendation_id"] == rid and row["pick_index"] == 2
    assert row["removed_at"] is None

    assert client.post(f"/picks/{rid}/2/unsave").json()["saved"] is False
    (row,) = pipeline.saved_rows
    assert row["removed_at"] is not None, "an unsave stamps the row rather than deleting it"

    client.post(f"/picks/{rid}/2/save")
    assert len(pipeline.saved_rows) == 2 and pipeline.saved_rows[1]["removed_at"] is None
    assert client.get("/scan/1").json()["picks"][2]["saved"] is True


def test_not_for_me_writes_a_feedback_row_of_that_kind():
    client, pipeline = make_client()
    rid = scan(client)
    res = client.post(f"/picks/{rid}/4/not-for-me")
    assert res.json() == {"recommendation_id": rid, "pick_index": 4, "saved": False, "not_for_me": True}
    (row,) = pipeline.feedback_rows
    assert row == {**row, "session_id": 1, "recommendation_id": rid, "pick_index": 4, "kind": "not_for_me"}
    picks = client.get("/scan/1").json()["picks"]
    assert picks[4]["not_for_me"] is True and picks[3]["not_for_me"] is False


def test_htmx_gets_the_actions_fragment_with_the_new_state():
    client, _ = make_client()
    rid = scan(client)
    res = client.post(f"/picks/{rid}/0/save", headers={"HX-Request": "true"})
    assert res.status_code == 200
    assert f'id="pick-actions-{rid}-0"' in res.text and 'data-saved="true"' in res.text
    assert f'hx-post="/picks/{rid}/0/unsave"' in res.text and "Saved" in res.text
    res = client.post(f"/picks/{rid}/0/not-for-me", headers={"HX-Request": "true"})
    assert 'data-not-for-me="true"' in res.text and "Marked not for me" in res.text and 'data-saved="true"' in res.text
    panel = client.get("/scan/1", headers={"HX-Request": "true"}).text
    assert 'data-saved="true"' in panel and panel.count('data-saved="false"') == 4


def test_picks_belong_to_the_session_and_the_index_must_exist():
    store = MemorySessions()
    pipeline = FakePipeline()
    app = create_app(pipeline=pipeline, sessions=store)
    owner, other = TestClient(app), TestClient(app)
    rid = scan(owner)
    assert other.post(f"/picks/{rid}/0/save").status_code == 404
    assert owner.post(f"/picks/{rid}/5/save").status_code == 404
    assert owner.post(f"/picks/{rid + 1}/0/save").status_code == 404
    assert other.post(f"/picks/{rid}/0/not-for-me").status_code == 404
    assert pipeline.saved_rows == [] and pipeline.feedback_rows == []


def test_a_failed_recommendation_has_no_picks_to_save():
    client, pipeline = make_client(FakePipeline(FakeClient(text_error="http 500")))
    scan_id = post_photo(client, small_jpeg()).json()["id"]
    events_of(client, scan_id)
    assert client.post("/picks/1/0/save").status_code == 404


def test_saved_list_shows_live_saves_newest_first_with_the_scan_date():
    client, pipeline = make_client()
    first = scan(client)
    second = scan(client)
    client.post(f"/picks/{first}/1/save")
    client.post(f"/picks/{second}/3/save")
    client.post(f"/picks/{first}/0/save")
    client.post(f"/picks/{second}/3/unsave")

    body = client.get("/reading-list", headers={"Accept": "application/json"}).json()["saved"]
    assert [(s["recommendation_id"], s["pick_index"]) for s in body] == [(first, 0), (first, 1)]
    assert body[0]["title"] == DEFAULT_PICKS[0]["title"] and body[0]["reason"] == DEFAULT_PICKS[0]["reason"]
    assert body[0]["scanned_at"] == pipeline.photos[1]["created_at"]

    page = client.get("/reading-list")
    assert page.status_code == 200 and page.headers["content-type"].startswith("text/html")
    assert page.text.count('class="saved-pick"') == 2
    assert f'id="saved-{first}-0"' in page.text and f'id="saved-{second}-3"' not in page.text
    assert f"Date added:</span> {scan_date(pipeline.photos[1]['created_at'])}" in page.text
    assert f'hx-post="/picks/{first}/0/unsave"' in page.text and 'hx-swap="delete"' in page.text


def test_saved_list_is_per_session_and_empty_at_first():
    store = MemorySessions()
    app = create_app(pipeline=FakePipeline(), sessions=store)
    a, b = TestClient(app), TestClient(app)
    rid = scan(a)
    a.post(f"/picks/{rid}/0/save")
    assert 'id="saved-empty"' in b.get("/reading-list").text
    assert b.get("/reading-list", headers={"Accept": "application/json"}).json() == {"saved": []}
    assert len(a.get("/reading-list", headers={"Accept": "application/json"}).json()["saved"]) == 1


def test_scan_date_is_readable():
    assert scan_date("2026-09-03T12:00:00.123456+00:00") == "3 September 2026"
    assert scan_date("2026-09-03T12:00:00Z") == "3 September 2026"
    assert scan_date("whenever") == "whenever"


def test_save_rate_from_the_rows():
    client, pipeline = make_client()
    first, second = scan(client), scan(client)
    client.post(f"/picks/{first}/0/save")
    client.post(f"/picks/{first}/1/save")
    client.post(f"/picks/{first}/1/unsave")
    client.post(f"/picks/{second}/2/save")
    client.post(f"/picks/{second}/4/not-for-me")
    client.post(f"/picks/{second}/4/not-for-me")  # a second mark on the same pick counts once

    rate = metrics.compute(list(pipeline.recommendations.values()), pipeline.saved_rows, pipeline.feedback_rows)
    assert (rate.scans, rate.picks, rate.saves, rate.not_for_me) == (2, 10, 2, 1)
    assert rate.saves_per_scan == 1.0 and rate.not_for_me_per_pick == 0.1
    assert rate.line() == "save rate 1.00 per scan (2 saves / 2 scans); not for me 0.10 per pick (1 / 10 picks)"


def test_save_rate_ignores_failed_runs_and_is_empty_without_scans():
    assert metrics.compute([], [], []).line() == "save rate - per scan (0 saves / 0 scans); not for me - per pick (0 / 0 picks)"
    failed = [{"id": 7, "parsed_recommendations": None, "error": "http 500"}]
    rate = metrics.compute(failed, [{"recommendation_id": 7, "pick_index": 0, "removed_at": None}], [])
    assert rate.scans == 0 and rate.saves == 0


# --- change 017: a second click is not a second row ----------------------------------------------------


def test_save_and_not_for_me_are_idempotent():
    client, pipeline = make_client()
    rid = scan(client)
    assert client.post(f"/picks/{rid}/0/save").status_code == 200
    assert client.post(f"/picks/{rid}/0/save").status_code == 200
    assert len(pipeline.saved_rows) == 1
    client.post(f"/picks/{rid}/0/unsave")
    client.post(f"/picks/{rid}/0/save")
    assert len(pipeline.saved_rows) == 2, "a save after an unsave is a new live row: the history stays"
    assert client.post(f"/picks/{rid}/1/not-for-me").status_code == 200
    assert client.post(f"/picks/{rid}/1/not-for-me").status_code == 200
    assert len(pipeline.feedback_rows) == 1
    assert client.get("/scan/1").json()["picks"][1]["not_for_me"] is True


def test_a_cover_id_that_is_not_digits_gets_no_image():
    assert Pick("t", "r", cover_id="12").cover_url == "https://covers.openlibrary.org/b/id/12-M.jpg"
    assert Pick("t", "r", cover_id="../x").cover_url is None and Pick("t", "r", cover_id="").cover_url is None
    assert SavedPick(1, 0, "t", "r", "", "", cover_id="12\"").cover_url is None
