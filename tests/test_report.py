"""Aggregation is pure and feeds the pass/fail table, so it is tested on hand-built rows."""

import pytest

from shelfscanner.report import extraction_stats, recommendation_stats, render


_ids = iter(range(1, 10_000))


def _ex(model="m", edge=1568, found=8, missed=2, invented=1, ms=1000, cost=0.01, error=None, photo=None):
    i = next(_ids)
    return dict(id=i, photo_id=photo if photo is not None else i, model=model, image_long_edge=edge, found_count=found,
                missed_count=missed, invented_count=invented, latency_ms=ms, cost_usd=cost, error=error)


def _rec(model="m", n=5, vs_ex=5, vs_gt=4, scores=None, ms=2000, cost=0.002, error=None, extraction=None):
    i = next(_ids)
    return dict(id=i, extraction_id=extraction if extraction is not None else i, model=model, parsed_recommendations={"recommendations": [{"title": str(i)} for i in range(n)]},
                valid_vs_extraction=vs_ex, valid_vs_ground_truth=vs_gt, specificity_scores=scores,
                latency_ms=ms, cost_usd=cost, error=error)


def test_extraction_groups_by_model_and_edge_and_skips_errors():
    rows = [_ex(found=8, missed=2), _ex(found=5, missed=5, invented=3), _ex(edge=2400, found=10, missed=0),
            _ex(error="boom", found=0, missed=10, invented=0, cost=None)]
    stats = {(s.model, s.long_edge): s for s in extraction_stats(rows)}
    a = stats[("m", 1568)]
    assert (a.photos, a.errors) == (2, 1)
    assert a.median_recall == pytest.approx(0.65)
    assert a.mean_invented == pytest.approx(2.0)
    assert a.mean_cost_usd == pytest.approx(0.01)
    assert stats[("m", 2400)].median_recall == 1.0


def test_recommendation_shares_and_specificity():
    rows = [_rec(vs_ex=5, vs_gt=4, scores=[3, 2, 3, 1, 2]), _rec(vs_ex=4, vs_gt=2), _rec(error="x", vs_ex=None, vs_gt=None)]
    s = recommendation_stats(rows)[0]
    assert (s.runs, s.errors, s.scored_runs) == (2, 1, 1)
    assert s.share_valid_vs_extraction == pytest.approx(9 / 10)
    assert s.share_valid_vs_ground_truth == pytest.approx(6 / 10)
    assert s.mean_specificity == pytest.approx(2.2)


def test_render_handles_empty_and_missing_values():
    text = render([], [])
    assert "(no rows)" in text
    text = render(extraction_stats([_ex(error="e", cost=None, ms=None)]), recommendation_stats([_rec()]))
    assert "  -" in text  # unavailable metrics render as a dash, not a crash


def test_rerun_of_same_photo_supersedes_earlier_ok_row_but_errors_still_count():
    rows = [_ex(photo=1, found=2, missed=8), _ex(photo=1, error="truncated", found=0, missed=10), _ex(photo=1, found=10, missed=0)]
    s = extraction_stats(rows)[0]
    assert (s.photos, s.errors) == (1, 1)
    assert s.median_recall == 1.0


def test_recommendation_rerun_on_same_extraction_supersedes():
    rows = [_rec(extraction=6, vs_ex=3), _rec(extraction=6, vs_ex=5)]
    s = recommendation_stats(rows)[0]
    assert s.runs == 1 and s.share_valid_vs_extraction == 1.0
