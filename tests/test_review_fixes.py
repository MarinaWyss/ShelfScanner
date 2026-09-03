"""The bugs the 2026-09-03 review found, each pinned by a test so it stays fixed. The finding is named
in each test's docstring; the code comment at the fix names the same thing."""

from __future__ import annotations

import struct
import zlib
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from research import check, report, review
from shelfscanner import extract, lookup, matching
from shelfscanner.adapters import openrouter
from shelfscanner.adapters.anthropic import AnthropicClient
from shelfscanner.config import Model
from shelfscanner.web import admin, pipeline
from shelfscanner.web.app import create_app
from shelfscanner.web.fakes import FakePipeline, MemorySessions
from shelfscanner.web.scan import NOT_AN_IMAGE
from tests.test_check import CFG, PICKS, ex, good_rows, rec
from tests.web_images import small_jpeg

# --- matching: a title with no letters or digits ------------------------------------------------


@pytest.mark.parametrize("title", ["...", "—", "", "???", "   "])
def test_symbol_only_titles_match_nothing_instead_of_raising(title):
    """`similarity` called `max()` over an empty list when a title normalised to nothing."""
    assert matching.similarity(title, "Dune") == 0.0
    assert matching.similarity("Dune", title) == 0.0
    scored = matching.score([title, "Dune"], ["Dune"], [], 0.85)
    assert scored.found == ["Dune"]


# --- extract --photo all -------------------------------------------------------------------------


def test_extract_all_means_labelled_photos_with_an_object(monkeypatch):
    """`--photo all` ran the vision model over app uploads and over rows retention had emptied."""
    monkeypatch.setattr(extract.storage, "list_photos", lambda: [
        {"id": 1, "titles": ["A"], "storage_path": "core/a.jpg"},
        {"id": 2, "titles": None, "storage_path": "sessions/9/x.jpg", "session_id": 9},  # an app upload
        {"id": 3, "titles": ["B"], "storage_path": None},  # deleted by retention
    ])
    assert [p["id"] for p in extract.resolve_photos("all")] == [1]


# --- adapters never raise -------------------------------------------------------------------------


def test_missing_openrouter_key_is_a_failed_result_that_fails_over(monkeypatch):
    """`settings.openrouter_api_key` raised SystemExit out of the adapter."""
    from shelfscanner import router

    def missing():
        raise SystemExit("Missing in .env: OPENROUTER_API_KEY (see .env.example)")

    monkeypatch.setattr(openrouter, "openrouter_api_key", missing)
    m = Model("qwen-flash", "qwen/qwen3.8-flash", "Alibaba", 0.1, 0.4)
    r = openrouter.OpenRouterClient().text(m, "p", "x")
    assert not r.ok and r.error.startswith("config: Missing in .env: OPENROUTER_API_KEY") and router.should_fail_over(r)


def test_anthropic_truncation_with_only_a_thinking_block_is_reported_as_truncated():
    """The no-text branch ran before the truncation check, so the row said "no text block"."""
    from tests.test_adapter_anthropic import SONNET, StubSDK, _response

    sdk = StubSDK(_response(None, stop_reason="max_tokens", blocks=[SimpleNamespace(type="thinking")]))
    r = AnthropicClient(client=sdk).vision(SONNET, "p", b"jpeg", max_tokens=300)
    assert r.truncated and r.error.startswith("truncated: hit max_tokens=300")


def test_google_missing_key_error_is_grouped_as_config():
    """The weekly review grouped Google's key message as its own kind; every adapter now says `config:`."""
    assert review.error_kind("config: GEMINI_API_KEY is not set: add it to .env") == "config"
    assert review.error_kind("config: OPENAI_API_KEY is not set; add it to .env") == "config"


# --- lookup: a JSON body that is not an object ---------------------------------------------------


def test_catalogue_reply_that_is_a_list_is_a_malformed_reply_not_a_raise():
    """`r.json().get("docs")` raised AttributeError, which the except clause did not catch."""

    class ListClient:
        def get(self, url, *, params, headers, timeout):
            return SimpleNamespace(status_code=200, json=lambda: ["not", "an", "object"])

    docs, error = lookup._search("Dune", None, client=ListClient(), timeout_s=1)
    assert docs == [] and error == "malformed reply"


# --- web: the CLI spend guard and any SystemExit in a stage --------------------------------------


def make_client(pipeline_: FakePipeline | None = None) -> tuple[TestClient, FakePipeline]:
    pipeline_ = pipeline_ or FakePipeline()
    return TestClient(create_app(pipeline=pipeline_, sessions=MemorySessions())), pipeline_


def events_of(client: TestClient, scan_id: int) -> list[str]:
    with client.stream("GET", f"/scan/{scan_id}/events") as s:
        return [line.split(": ", 1)[1] for line in s.iter_lines() if line.startswith("event:")]


def test_a_system_exit_in_a_stage_is_a_failed_scan_not_a_dead_server():
    """`SystemExit` from the spend guard escaped the stage runner and took uvicorn down, leaving the
    row at `reading`."""
    client, fake = make_client()

    def read(photo, on_progress):
        raise SystemExit("Spend cap reached: $30.00 since 2026-09-02")

    fake.read = read
    scan_id = client.post("/scan", files={"photo": ("s.jpg", small_jpeg(), "image/jpeg")}).json()["id"]
    assert events_of(client, scan_id)[-2:] == ["failed", "close"]
    assert client.get("/").status_code == 200  # the server is still there
    # A raised stage (as opposed to a model failure in the row) goes back to pending so a reconnect retries.
    assert fake.photos[scan_id]["status"] == "pending"
    assert client.get(f"/scan/{scan_id}").json()["status"] == "pending"


# --- web: a checking failure is replayed on reconnect ---------------------------------------------


class Query:
    """Enough of the PostgREST builder for `_record_failed_step`, `result` and `spent_since`."""

    def __init__(self, db, name):
        self.db, self.name, self.filters, self.payload, self.negate = db, name, [], None, False

    def select(self, *a, **k):
        return self

    def insert(self, row):
        self.payload = row
        return self

    def eq(self, col, val):
        self.filters.append(lambda r: r.get(col) == val)
        return self

    def gte(self, col, val):
        self.filters.append(lambda r: r.get(col) >= val)
        return self

    def in_(self, col, vals):
        self.filters.append(lambda r: r.get(col) in set(vals))
        return self

    @property
    def not_(self):
        self.negate = True
        return self

    def is_(self, col, val):
        neg = self.negate
        self.negate = False
        self.filters.append(lambda r: (r.get(col) is None) != neg)
        return self

    def order(self, *a, **k):
        return self

    def limit(self, n):
        self.filters.append(("limit", n))
        return self

    def execute(self):
        rows = self.db.setdefault(self.name, [])
        if self.payload is not None:  # Postgres returns every column; the unset ones are null
            row = {"id": len(rows) + 1, "failover_from": None, "failover_error": None, **self.payload}
            rows.append(row)
            return SimpleNamespace(data=[row])
        out = list(rows)
        for f in self.filters:
            if isinstance(f, tuple):
                out = out[-f[1]:]
            else:
                out = [r for r in out if f(r)]
        return SimpleNamespace(data=out)


class StubDB(dict):
    def table(self, name):
        return Query(self, name)


def test_a_checking_failure_writes_a_row_so_result_replays_it(monkeypatch):
    """`choose` returned a failed step without a `recommendations` row; `result` then saw an incomplete
    scan and the event loop waited forever on a `failed` row it could never claim."""
    db = StubDB()
    db["extractions"] = [{"id": 5, "photo_id": 1, "parsed_titles": {"books": []}, "error": None, "model": "m",
                          "failover_from": None, "failover_error": None}]
    monkeypatch.setattr(pipeline.SupabasePipeline, "_db", lambda self: db)
    p = pipeline.SupabasePipeline()
    rid = p._record_failed_step(db["extractions"][0], {"genres": []}, "checking", "none of the 3 titles read matched")
    assert db["recommendations"][0]["error"] == "checking: none of the 3 titles read matched"
    assert db["recommendations"][0]["extraction_id"] == 5 and rid == 1
    scan = p.result(1)
    assert scan.complete and scan.failed_stage == "checking"
    assert scan.error == "none of the 3 titles read matched" and scan.choosing.recommendation_id == 1


def test_split_step_reads_the_prefix():
    assert pipeline.split_step("checking: nothing matched") == ("checking", "nothing matched")
    assert pipeline.split_step("choosing: list empty") == ("choosing", "list empty")
    assert pipeline.split_step("http 429: slow down") == ("choosing", "http 429: slow down")


# --- web: the app's daily cap counts the app's rows only ----------------------------------------


def test_app_spend_excludes_research_rows(monkeypatch):
    """`spent_since` summed both runs tables whoever wrote them, so a nightly eval could spend the app's
    day before anyone scanned."""
    since = datetime(2026, 9, 3, tzinfo=UTC)
    db = StubDB()
    db["photos"] = [{"id": 1, "session_id": 7, "created_at": "2026-09-03T10:00:00+00:00"},
                    {"id": 2, "session_id": None, "created_at": "2026-09-03T03:17:00+00:00"},  # nightly eval
                    {"id": 3, "session_id": 7, "created_at": "2026-09-02T23:00:00+00:00"}]  # yesterday
    db["extractions"] = [{"id": 11, "photo_id": 1, "cost_usd": 0.01}, {"id": 12, "photo_id": 2, "cost_usd": 5.0},
                         {"id": 13, "photo_id": 3, "cost_usd": 0.5}]
    db["recommendations"] = [{"extraction_id": 11, "cost_usd": 0.002}, {"extraction_id": 12, "cost_usd": 5.0}]
    monkeypatch.setattr(pipeline.SupabasePipeline, "_db", lambda self: db)
    assert pipeline.SupabasePipeline().spent_since(since) == pytest.approx(0.012)


# --- web: sessions only for routed requests, admin on odd keys, bomb headers ----------------------


def test_a_404_creates_no_session_row_and_sets_no_cookie():
    """Every cookieless request on any path inserted a `sessions` row: crawlers, favicons, typos."""
    store = MemorySessions()
    client = TestClient(create_app(pipeline=FakePipeline(), sessions=store))
    r = client.get("/favicon.ico")
    assert r.status_code == 404 and "set-cookie" not in r.headers and len(store.rows) == 0
    r = client.get("/")
    assert r.status_code == 200 and len(store.rows) == 0, "the homepage is unsessioned (012)"
    r = client.get("/scan", follow_redirects=False)
    assert r.status_code == 302 and len(store.rows) == 1


def test_non_ascii_admin_key_is_a_404_not_a_500(monkeypatch):
    """`secrets.compare_digest` raises TypeError on non-ASCII text, and a 500 reveals the route."""
    monkeypatch.setenv(admin.SECRET_ENV, "correct-horse")
    monkeypatch.setattr(admin, "load_dotenv", lambda *a, **k: None)
    client, _ = make_client()
    assert client.get("/admin", params={"key": "é"}).status_code == 404
    assert client.get("/admin", params={"key": "correct-horse"}).status_code == 200


def png_header(width: int, height: int) -> bytes:
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    chunk = b"IHDR" + ihdr
    return b"\x89PNG\r\n\x1a\n" + struct.pack(">I", len(ihdr)) + chunk + struct.pack(">I", zlib.crc32(chunk) & 0xFFFFFFFF)


def test_a_decompression_bomb_header_is_refused_not_a_500():
    """Pillow raises `DecompressionBombError` at `Image.open`, which the refusal did not catch."""
    client, _ = make_client()
    r = client.post("/scan", files={"photo": ("bomb.png", png_header(30000, 30000), "image/png")})
    assert r.status_code == 400 and r.json()["error"] == NOT_AN_IMAGE


def test_goodreads_export_over_the_limit_is_refused():
    client, _ = make_client()
    client.get("/")
    big = b"Title,Author\n" + b"x" * (4 * 1024 * 1024 + 10)
    r = client.post("/preferences", data={"action": "save", "genres": [], "free_text": ""},
                    files={"goodreads": ("goodreads_library_export.csv", big, "text/csv")})
    assert r.status_code == 413 and "over 4 MB" in r.text


# --- research: the check knows `all` and keeps adapters apart; the report flags stale prices -------


def test_check_measures_every_labelled_photo_for_all():
    rows = good_rows()
    m = check.measure(rows, CFG, "all", PICKS)
    labelled = [p for p in rows["photos"] if p.get("titles")]
    assert m["photos"] == len(labelled) > 5 and m["set"] == "all"  # the fixture has a labelled photo in another set


def test_check_prefers_the_configured_adapter_and_says_which():
    """The check took the alphabetically first adapter group; rows for one model through two adapters
    could pick the wrong one silently."""
    rows = good_rows()
    slow = [dict(ex(p, ms=99000, cost=0.5), adapter="openrouter") for p in range(1, 6)]
    for r in rows["extractions"]:
        r["adapter"] = CFG.model(CFG.stage("reading").primary).adapter
    rows["extractions"] += slow
    m = check.measure(rows, CFG, "core", PICKS)
    assert m["reading"]["adapter"] == CFG.model(CFG.stage("reading").primary).adapter
    assert m["reading"]["p50_latency_ms"] == 11000
    # Only OpenRouter rows: the check measures them and says so rather than reporting no value.
    rows = {"photos": good_rows()["photos"], "extractions": slow, "recommendations": [rec(e["id"]) for e in slow]}
    m = check.measure(rows, CFG, "core", PICKS)
    assert m["reading"]["adapter"] == "openrouter" and m["reading"]["photos"] == 5


def test_report_price_line_flags_ninety_days():
    from shelfscanner.web.metrics import price_check

    today = datetime(2026, 12, 15, tzinfo=UTC).date()
    assert report.price_line(price_check(today - timedelta(days=100), today)).endswith("100 days ago: STALE, check them")
    assert report.price_line(price_check(today - timedelta(days=10), today)).endswith("10 days ago: ok")
    assert report.price_line(price_check(None, today)).startswith("PRICES  no prices_checked")


def test_review_counts_complete_scans_by_photo_not_by_run():
    from tests.test_review import FAILOVER_ERRORS, SINCE, TODAY, seeded

    rows = seeded()
    rows.recommendations.append({"id": 2, "extraction_id": 1, "model": "gpt-mini", "error": None, "failover_from": None,
                                 "parsed_recommendations": {"recommendations": []}, "created_at": rows.recommendations[0]["created_at"]})
    r = review.collect(rows.since(SINCE).app(), SINCE, TODAY, "app", FAILOVER_ERRORS)
    assert r.complete == 1
