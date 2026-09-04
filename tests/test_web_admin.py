"""The dashboard page (009 task 2) against the fake pipeline: a 404 without a secret in the environment,
the login form without the cookie (017 D3), the seven-day table with the numbers from a scan, the window
switch, the view helpers."""

import re

import pytest
from fastapi.testclient import TestClient

from shelfscanner.web import admin
from shelfscanner.web.app import create_app
from shelfscanner.web.fakes import FakeClient, FakePipeline, MemorySessions
from tests.test_web_scan import events_of, post_photo
from tests.web_images import small_jpeg

SECRET = "correct-horse"


def make_client(pipeline: FakePipeline | None = None) -> tuple[TestClient, FakePipeline]:
    pipeline = pipeline or FakePipeline()
    return TestClient(create_app(pipeline=pipeline, sessions=MemorySessions())), pipeline


def login(client: TestClient, key: str = SECRET):
    return client.post("/admin", data={"key": key}, follow_redirects=False)


def scan(client: TestClient) -> int:
    scan_id = post_photo(client, small_jpeg()).json()["id"]
    events_of(client, scan_id)
    return client.get(f"/scan/{scan_id}").json()["recommendation_id"]


def test_no_secret_in_the_environment_means_always_404(monkeypatch):
    client, _ = make_client()  # first: creating the app reads .env, and the laptop's has a secret
    monkeypatch.delenv(admin.SECRET_ENV, raising=False)
    monkeypatch.setattr(admin, "load_dotenv", lambda *a, **k: None)
    assert client.get("/admin").status_code == 404
    assert client.get("/admin?key=anything").status_code == 404
    assert login(client, "anything").status_code == 404


def test_the_form_without_the_cookie_and_the_dashboard_with_it(monkeypatch):
    # 017 D3: the key is posted once; the cookie is derived from the secret, never equal to it.
    monkeypatch.setenv(admin.SECRET_ENV, SECRET)
    client, _ = make_client()
    res = client.get("/admin")
    assert res.status_code == 200 and 'id="admin-key"' in res.text and 'id="overview"' not in res.text
    assert "set-cookie" not in res.headers
    res = client.get(f"/admin?key={SECRET}")
    assert 'id="admin-key"' in res.text and "set-cookie" not in res.headers, "the query string is not a key any more"
    res = client.get("/admin", headers={"cookie": f"{admin.COOKIE}={SECRET}"})
    assert 'id="admin-key"' in res.text, "the secret itself is not the cookie"

    res = login(client, "wrong")
    assert res.status_code == 403 and 'id="admin-key"' in res.text and admin.WRONG_KEY in res.text
    assert "set-cookie" not in res.headers

    res = login(client)
    assert res.status_code == 303 and res.headers["location"] == "/admin"
    cookie = res.headers["set-cookie"]
    assert f"{admin.COOKIE}={admin.cookie_value(SECRET)}" in cookie and SECRET not in cookie
    assert "HttpOnly" in cookie and "SameSite=strict" in cookie and "Path=/admin" in cookie
    assert "Secure" not in cookie, "plain http on the laptop, as for the session cookie"
    res = client.get("/admin?window=30")
    assert res.status_code == 200 and 'id="overview"' in res.text and 'data-window="30"' in res.text

    monkeypatch.setenv(admin.SECRET_ENV, "rotated")
    assert 'id="admin-key"' in client.get("/admin").text, "a new secret revokes every cookie"


def test_the_admin_cookie_is_secure_over_https(monkeypatch):
    monkeypatch.setenv(admin.SECRET_ENV, SECRET)
    client, _ = make_client()
    res = client.post("/admin", data={"key": SECRET}, follow_redirects=False, headers={"x-forwarded-proto": "https"})
    assert res.status_code == 303 and "; Secure" in res.headers["set-cookie"]


def test_the_seven_day_table_shows_the_scan_and_its_feedback(monkeypatch):
    monkeypatch.setenv(admin.SECRET_ENV, SECRET)
    client, pipeline = make_client()
    rid = scan(client)
    client.post(f"/picks/{rid}/0/save")
    client.post(f"/picks/{rid}/1/save")
    client.post(f"/picks/{rid}/4/not-for-me")
    login(client)
    html = client.get("/admin").text
    assert '<table id="overview" data-window="7">' in html
    assert "Last 7 days" in html
    rows = {cells[0]: cells[1:] for cells in _table_rows(html, "overview")}
    assert rows["Scans started"] == ["1", "0"]
    assert rows["Scans with picks"] == ["1", "0"]
    assert rows["Completion rate"] == ["100%", "–"]
    assert rows["Saves per scan"] == ["2.00", "–"]
    assert rows["Not-for-me per pick"] == ["0.20", "–"]
    assert 'id="spark-scans"' in html and "<polyline" in html
    assert "Model prices last checked" in html


def test_a_failed_reading_is_a_model_failure_and_an_unknown_window_falls_back(monkeypatch):
    monkeypatch.setenv(admin.SECRET_ENV, SECRET)
    client, _ = make_client(FakePipeline(FakeClient(error="the model timed out")))
    scan_id = post_photo(client, small_jpeg()).json()["id"]
    events_of(client, scan_id)
    login(client)
    html = client.get("/admin?window=14").text
    assert 'data-window="7"' in html
    rows = {cells[0]: cells[1:] for cells in _table_rows(html, "errors")}
    assert rows["Model failures (rows with an error)"][0] == "1 / 1 (100%)"
    assert rows["Application failures (scans that reached no model)"][0] == "0 / 1 (0%)"
    overview = {cells[0]: cells[1:] for cells in _table_rows(html, "overview")}
    assert overview["Completion rate"][0] == "0%"


def test_each_window_renders(monkeypatch):
    monkeypatch.setenv(admin.SECRET_ENV, SECRET)
    client, _ = make_client()
    scan(client)
    login(client)
    for window, label in (("7", "Last 7 days"), ("30", "Last 30 days"), ("all", "All time")):
        html = client.get(f"/admin?window={window}").text
        assert f'data-window="{window}"' in html and f'<p class="lede">{label}:' in html


def test_spark_points_scale_to_the_maximum_and_skip_gaps():
    assert admin.spark_points([]) == "" and admin.spark_points([None, None]) == ""
    points = admin.spark_points([0, 2, None, 4], width=100, height=20, pad=0).split()
    assert points == ["0.0,20.0", "33.3,10.0", "100.0,0.0"]
    assert admin.spark_points([3], width=100, height=20, pad=0) == "0.0,0.0"


@pytest.mark.parametrize("fn, value, text", [
    (admin.fmt_rate, None, "–"), (admin.fmt_rate, 0.5, "50%"), (admin.fmt_ratio, 2 / 3, "0.67"),
    (admin.fmt_ms, 850, "850 ms"), (admin.fmt_ms, 1234, "1.2 s"), (admin.fmt_usd, 0.01234, "$0.0123"),
])
def test_formats(fn, value, text):
    assert fn(value) == text


def _table_rows(html: str, table_id: str) -> list[list[str]]:
    """The text of each body row's cells in the table with this id. Tags stripped, nothing else."""
    table = html.split(f'<table id="{table_id}"', 1)[1].split("</table>", 1)[0]
    body = table.split("<tbody>", 1)[1]
    return [[re.sub(r"<[^>]+>", "", cell).strip() for cell in re.findall(r"<td>(.*?)</td>", row, flags=re.S)]
            for row in re.findall(r"<tr>(.*?)</tr>", body, flags=re.S)]
