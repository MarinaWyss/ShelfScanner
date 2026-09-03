"""The weekly review draft (009 task 3) over seeded rows: the sort into model and application
failures, the failover reasons, the marks with their picks, the patterns, and the file's shape."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from research import review
from shelfscanner.web import metrics

TODAY = datetime(2026, 9, 8, tzinfo=UTC)
SINCE = TODAY - timedelta(days=7)


def ts(days_ago: int) -> str:
    return (TODAY - timedelta(days=days_ago)).isoformat()


def seeded() -> metrics.Rows:
    photos, extractions, recommendations, saved, feedback = [], [], [], [], []
    # App scans: photo 1 complete with a mark, photo 2 a model failure, photo 3 never reached a model.
    photos += [{"id": 1, "session_id": "s1", "titles": None, "created_at": ts(2)},
               {"id": 2, "session_id": "s1", "titles": None, "created_at": ts(3)},
               {"id": 3, "session_id": "s2", "titles": None, "created_at": ts(1)},
                    # Test set: three 429s on the same model, one of them failed over.
               {"id": 10, "session_id": None, "titles": ["A"], "created_at": ts(4)},
               {"id": 11, "session_id": None, "titles": ["B"], "created_at": ts(4)},
               {"id": 12, "session_id": None, "titles": ["C"], "created_at": ts(4)},
                    # Outside the window.
               {"id": 99, "session_id": "s9", "titles": None, "created_at": ts(20)}]
    extractions += [
        {"id": 1, "photo_id": 1, "model": "gemini", "error": None, "failover_from": None, "created_at": ts(2)},
        {"id": 2, "photo_id": 2, "model": "gemini", "error": "truncated: 8192 tokens, 3000 reasoning",
         "failover_from": None, "created_at": ts(3)},
        {"id": 10, "photo_id": 10, "model": "qwen", "error": "http 429: rate limited", "failover_from": None, "created_at": ts(4)},
        {"id": 11, "photo_id": 11, "model": "qwen", "error": "http 429: rate limited", "failover_from": None, "created_at": ts(4)},
        {"id": 12, "photo_id": 12, "model": "haiku", "error": None, "failover_from": "qwen", "created_at": ts(4)},
        {"id": 99, "photo_id": 99, "model": "gemini", "error": "parse: not json", "failover_from": None, "created_at": ts(20)},
    ]
    recommendations += [
        {"id": 1, "extraction_id": 1, "model": "gpt-mini", "error": None, "failover_from": None,
         "parsed_recommendations": {"recommendations": [{"title": "Dune", "reason": "sand"}, {"title": "Emma", "reason": "wit"}]},
         "created_at": ts(2)},
    ]
    saved += [{"id": 1, "recommendation_id": 1, "pick_index": 0, "removed_at": None, "created_at": ts(2)}]
    feedback += [{"id": 1, "recommendation_id": 1, "pick_index": 1, "kind": "not_for_me", "created_at": ts(1)},
                 {"id": 2, "recommendation_id": 1, "pick_index": 1, "kind": "not_for_me", "created_at": ts(1)}]
    return metrics.Rows(photos=photos, extractions=extractions, recommendations=recommendations,
                        saved=saved, feedback=feedback)


FAILOVER_ERRORS = {("reading", 12): "http 429: rate limited"}


def test_error_kind_groups_on_the_head():
    assert review.error_kind("http 429: rate limited") == "http 429"
    assert review.error_kind("truncated: 8192 tokens") == "truncated"
    assert review.error_kind("GEMINI_API_KEY is not set") == "gemini_api_key is not set"
    assert review.error_kind("") == "unknown"


def test_app_population_sorts_failures_and_marks():
    r = review.collect(seeded().since(SINCE).app(), SINCE, TODAY, "app", FAILOVER_ERRORS)
    assert (r.scans, r.complete, r.saves) == (3, 1, 1)
    assert [(f.stage, f.kind, f.row_id) for f in r.model_failures] == [("reading", "truncated", 2)]
    assert [f.row_id for f in r.application_failures] == [3]
    assert r.failovers == []
    assert [(m.title, m.reason, m.model) for m in r.marks] == [("Emma", "wit", "gpt-mini")] * 2
    assert r.patterns() == ["'Emma' marked not for me 2 times"]


def test_test_set_population_counts_failovers_with_the_primary_error():
    r = review.collect(seeded().since(SINCE).labelled(), SINCE, TODAY, "test set", FAILOVER_ERRORS)
    assert len(r.model_failures) == 2 and len(r.failovers) == 1
    assert r.failovers[0].model == "qwen" and r.failovers[0].kind == "http 429"
    # Two 429 errors plus one 429 failover on the same model make a pattern.
    assert r.patterns() == ["reading on qwen: `http 429` 3 times"]


def test_rows_outside_the_window_are_ignored():
    rows = seeded().since(SINCE)
    assert 99 not in {p["id"] for p in rows.photos}
    assert all(e["id"] != 99 for e in rows.extractions)


def test_draft_has_the_sections_and_reviewer_headings():
    text = review.draft(SINCE, TODAY, rows=seeded(), failover_errors=FAILOVER_ERRORS)
    assert text.startswith("# Weekly review, 2026-09-08")
    for heading in ("## Patterns", "## App", "## Test set", "### Model failures", "### Application failures",
                    "### Failovers", "### Not for me", "## What the rows say", "## Suggested change"):
        assert heading in text, heading
    assert "- App: 'Emma' marked not for me 2 times" in text
    assert "- Test set: reading on qwen: `http 429` 3 times" in text
    assert "| reading | gemini | `truncated` | 1 |" in text
    assert "*Emma*: wit" in text


def test_last_review_date_reads_the_newest_dated_file(tmp_path):
    assert review.last_review_date(tmp_path) is None
    (tmp_path / "PROMPT.md").write_text("brief")
    (tmp_path / "2026-09-01.md").write_text("x")
    (tmp_path / "2026-09-08.md").write_text("x")
    assert review.last_review_date(tmp_path) == datetime(2026, 9, 8, tzinfo=UTC)
