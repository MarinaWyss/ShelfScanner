"""research.check is the regression gate, so it is tested on hand-built rows against a hand-built baseline."""

import json

import pytest

from research import check
from research.check import compare, load_baseline, measure, overlap, render
from shelfscanner.config import load_config

CFG = load_config()
READING = CFG.model(CFG.stage("reading").primary).slug
CHOOSING = CFG.model(CFG.stage("choosing").primary).slug
EDGE = CFG.default_max_edge
T = CFG.match_threshold

PHOTOS = [{"id": i, "titles": ["A", "B"], "partial_titles": []} for i in range(1, 6)] + [
    {"id": 6, "titles": [], "partial_titles": []},  # unlabelled: never counted
    {"id": 7, "titles": ["X"], "partial_titles": [], "set": "sourced"},  # another set
]
PICKS = {1: ["Dune", "Emma"], 2: ["Dune", "Emma"], 3: ["Dune", ["Emma", "Persuasion"]], 4: ["Dune"], 5: ["Dune"]}
BASE = {
    "photos": 5,
    "reading": {"model": READING, "long_edge": EDGE, "median_recall": 1.0, "mean_invented": 0.0,
                "p50_latency_ms": 11000, "mean_cost_usd": 0.0076},
    "choosing": {"model": CHOOSING, "share_valid_vs_extraction": 1.0, "median_overlap": 2,
                 "p50_latency_ms": 3000, "mean_cost_usd": 0.002},
    "cost_per_scan_usd": 0.0096,
}

_ids = iter(range(1, 10_000))


def ex(photo, model=READING, edge=EDGE, found=10, missed=0, invented=0, ms=11000, cost=0.0076, error=None):
    return {"id": next(_ids), "photo_id": photo, "model": model, "image_long_edge": edge, "error": error,
            "found_count": found, "missed_count": missed, "invented_count": invented, "latency_ms": ms, "cost_usd": cost}


def rec(extraction, model=CHOOSING, titles=("Dune", "Emma", "C", "D", "E"), valid=5, ms=3000, cost=0.002, error=None):
    return {"id": next(_ids), "extraction_id": extraction, "model": model, "error": error,
            "parsed_recommendations": {"recommendations": [{"title": t, "reason": ""} for t in titles]},
            "valid_vs_extraction": valid, "valid_vs_ground_truth": valid, "specificity_scores": None,
            "latency_ms": ms, "cost_usd": cost}


def good_rows():
    exs = [ex(p) for p in range(1, 6)]
    return {"photos": PHOTOS, "extractions": exs, "recommendations": [rec(e["id"]) for e in exs]}


def run(rows, base=BASE, set_name="core"):
    m = measure(rows, CFG, set_name, PICKS)
    return m, compare(m, base)


def test_good_rows_measure_as_expected_and_pass():
    m, regressions = run(good_rows())
    assert regressions == []
    assert m["photos"] == 5
    r, c = m["reading"], m["choosing"]
    assert (r["model"], r["photos"], r["errors"]) == (READING, 5, 0)
    assert (r["median_recall"], r["mean_invented"], r["p50_latency_ms"], r["mean_cost_usd"]) == (1.0, 0.0, 11000, 0.0076)
    assert (c["model"], c["runs"], c["errors"], c["overlap_runs"]) == (CHOOSING, 5, 0, 5)
    assert (c["share_valid_vs_extraction"], c["median_overlap"], c["p50_latency_ms"], c["mean_cost_usd"]) == (1.0, 2, 3000, 0.002)
    assert m["cost_per_scan_usd"] == pytest.approx(0.0096)


def test_unlabelled_photos_other_sets_and_other_models_are_ignored():
    rows = good_rows()
    rows["extractions"] += [ex(6, found=0, missed=9, invented=9), ex(7, found=0, missed=9, invented=9),
                            ex(1, model="other/model", found=0, missed=9, invented=9), ex(1, edge=2400, found=0, missed=9)]
    rows["recommendations"] += [rec(rows["extractions"][-1]["id"], model="other/model", valid=0)]
    m, regressions = run(rows)
    assert regressions == []
    assert (m["photos"], m["reading"]["photos"], m["choosing"]["runs"]) == (5, 5, 5)


def test_another_set_measures_its_own_photos():
    rows = good_rows()
    rows["extractions"].append(ex(7, found=1, missed=1))
    rows["recommendations"].append(rec(rows["extractions"][-1]["id"], titles=("Q",)))
    m = measure(rows, CFG, "sourced", PICKS)
    assert (m["photos"], m["reading"]["photos"], m["reading"]["median_recall"], m["choosing"]["runs"]) == (1, 1, 0.5, 1)
    assert m["choosing"]["median_overlap"] is None  # no picks for that photo


def test_latest_row_per_photo_supersedes_earlier_ones():
    # Lower ids than the good rows for photo 1: an earlier, worse run of both stages.
    old = ex(1, found=2, missed=8, invented=5, ms=50_000, cost=1.0)
    old_rec = rec(old["id"], titles=("Z", "Y", "X", "W", "V"), valid=0, ms=60_000, cost=1.0)
    rows = good_rows()
    rows["extractions"].insert(0, old)
    rows["recommendations"].insert(0, old_rec)
    m, regressions = run(rows)
    # Reading: the latest row per photo is the measurement. Choosing: overlap averages the latest three
    # runs per photo (decided 2026-09-03), so the old run on photo 1 still counts, (2 + 0) / 2 = 1, and
    # the median across photos drops to 1 against a baseline of 2: past the half point, a regression.
    assert m["reading"]["median_recall"] == 1.0 and m["choosing"]["median_overlap"] == 1
    assert regressions == ["choosing.median_overlap: 1.0000 vs baseline 2, 0.5 under allowed"]


def test_error_rows_are_counted_but_do_not_score():
    rows = good_rows()
    rows["extractions"].append(ex(3, error="timeout", found=0, missed=0))
    rows["recommendations"].append(rec(rows["extractions"][2]["id"], error="json parse", valid=0, titles=()))
    m, regressions = run(rows)
    assert regressions == []
    assert (m["reading"]["errors"], m["choosing"]["errors"]) == (1, 1)


@pytest.mark.parametrize("change, metric", [
    (lambda rows: [e.update(found_count=5, missed_count=5) for e in rows["extractions"][:3]], "reading.median_recall"),
    (lambda rows: rows["extractions"][0].update(invented_count=1), "reading.mean_invented"),
    (lambda rows: [e.update(latency_ms=12_200) for e in rows["extractions"]], "reading.p50_latency_ms"),
    (lambda rows: [e.update(cost_usd=0.0084) for e in rows["extractions"]], "reading.mean_cost_usd"),
    (lambda rows: rows["recommendations"][0].update(valid_vs_extraction=4), "choosing.share_valid_vs_extraction"),
    (lambda rows: [r["parsed_recommendations"]["recommendations"].pop(1) for r in rows["recommendations"]],
     "choosing.median_overlap"),
    (lambda rows: [r.update(latency_ms=3400) for r in rows["recommendations"]], "choosing.p50_latency_ms"),
    (lambda rows: [r.update(cost_usd=0.0023) for r in rows["recommendations"]], "choosing.mean_cost_usd"),
])
def test_each_regression_is_named(change, metric):
    rows = good_rows()
    change(rows)
    _, regressions = run(rows)
    assert any(x.startswith(metric + ":") for x in regressions), regressions


def test_median_recall_uses_the_median():
    rows = good_rows()
    rows["extractions"][0].update(found_count=5, missed_count=5)
    rows["extractions"][1].update(found_count=5, missed_count=5)
    assert run(rows)[1] == []  # two of five photos at 0.5 leave the median at 1.0
    rows["extractions"][2].update(found_count=5, missed_count=5)
    assert any(x.startswith("reading.median_recall:") for x in run(rows)[1])


def test_latency_and_cost_tolerance_is_ten_percent():
    rows = good_rows()
    for e in rows["extractions"]:
        e.update(latency_ms=12_000, cost_usd=0.0083)  # +9 %
    for r in rows["recommendations"]:
        r.update(latency_ms=3290, cost_usd=0.00218)
    assert run(rows)[1] == []
    for e in rows["extractions"]:
        e.update(latency_ms=12_200)  # +11 %
    regressions = run(rows)[1]
    assert regressions == ["reading.p50_latency_ms: 12200 vs baseline 11000, 10% allowed"]


def test_cost_per_scan_is_compared_too():
    rows = good_rows()
    base = dict(BASE, cost_per_scan_usd=0.005)
    regressions = run(rows, base)[1]
    assert regressions == ["cost_per_scan_usd: 0.0096 vs baseline 0.0050, 10% allowed"]


def test_missing_photo_fails_even_when_the_median_would_pass():
    rows = good_rows()
    rows["extractions"].pop()  # photo 5 has no reading row, so no recommendation either
    regressions = run(rows)[1]
    assert "reading: 4 of 5 photos have a row without error for " + READING in regressions
    assert "choosing: 4 of 5 photos have a row without error for " + CHOOSING in regressions
    assert not any(x.startswith("reading.median_recall") for x in regressions)


def test_no_rows_reports_no_value():
    rows = {"photos": PHOTOS, "extractions": [], "recommendations": []}
    m, regressions = run(rows)
    assert m["cost_per_scan_usd"] is None
    assert "reading.median_recall: no value (baseline 1.0000)" in regressions
    assert "choosing.median_overlap: no value (baseline 2)" in regressions


def test_no_photos_in_set_fails():
    assert run(good_rows(), set_name="nope")[1] == ["no labelled photos in set 'nope'"]


def test_overlap_counts_picks_and_accepts_any_alternative():
    assert overlap(["Dune", "Persuasion"], ["Dune", ["Emma", "Persuasion"], "Ulysses"], T) == 2
    assert overlap(["dune"], ["Dune"], T) == 1
    assert overlap([], ["Dune"], T) == 0


def test_render_flags_a_swapped_primary_and_the_verdict():
    m, regressions = run(good_rows())
    text = render(m, BASE, regressions)
    assert "PASS" in text and READING in text and CHOOSING in text
    swapped = dict(BASE, reading=dict(BASE["reading"], model="someone/else"))
    text = render(m, swapped, compare(m, swapped))
    assert "note: reading primary is " + READING in text
    rows = good_rows()
    rows["extractions"][0].update(invented_count=3)
    m, regressions = run(rows)
    assert "REGRESSION\n  reading.mean_invented: 0.6000 vs baseline 0.0000" in render(m, BASE, regressions)


def test_committed_baseline_is_change_001s_pair_with_overlap_remeasured():
    b = load_baseline()
    core = b["sets"]["core"]
    assert core["photos"] == 5
    assert CFG.model(core["reading"]["model"]).provider == "Google"
    assert CFG.model(core["choosing"]["model"]).provider == "OpenAI"
    assert core["reading"]["long_edge"] == EDGE
    assert set(core["reading"]) >= set(check.READING_METRICS)
    assert set(core["choosing"]) >= set(check.CHOOSING_METRICS)
    assert (core["reading"]["median_recall"], core["reading"]["mean_invented"]) == (1.0, 0.0)
    # Overlap was re-baselined on 2026-09-03 to the three-run measurement of the default prompt (3.33).
    assert (core["choosing"]["share_valid_vs_extraction"], core["choosing"]["median_overlap"]) == (1.0, 3.33)
    assert core["cost_per_scan_usd"] == pytest.approx(core["reading"]["mean_cost_usd"] + core["choosing"]["mean_cost_usd"])


def test_main_prints_json_and_exits_nonzero_on_regression(monkeypatch, capsys):
    rows = good_rows()
    monkeypatch.setattr(check, "fetch", lambda: rows)
    monkeypatch.setattr(check, "baseline_for", lambda set_name, path=None: BASE)
    monkeypatch.setattr(check, "load_picks", lambda path=None: PICKS)
    assert check.main(["--set", "core", "--json"]) == 0
    out = json.loads(capsys.readouterr().out)
    assert out["regressions"] == [] and out["measured"]["set"] == "core" and out["baseline"] == BASE

    rows["extractions"][0].update(invented_count=2)
    assert check.main([]) == 1
    text = capsys.readouterr().out
    assert "REGRESSION" in text and "reading.mean_invented" in text


def test_unknown_set_has_no_baseline():
    with pytest.raises(SystemExit, match="No baseline for set 'nope'"):
        check.baseline_for("nope")


def test_overlap_is_the_mean_over_the_latest_three_runs_per_photo():
    """A rerun moves one pick on one shelf; one run's median is not the metric (decided 2026-09-03)."""
    from research.check import photo_overlaps

    rows = good_rows()
    e1 = rows["extractions"][0]["id"]
    older = [rec(e1, titles=("A", "B", "C", "D", "E")), rec(e1, titles=("Dune", "B", "C", "D", "E")),
             rec(e1, titles=("A", "B", "C", "D", "E"))]  # four runs for photo 1: only the newest three count
    latest = rec(e1, titles=("Dune", "Emma", "C", "D", "E"))
    rec_rows = older + [r for r in rows["recommendations"] if r["extraction_id"] != e1] + [latest]
    photo_of = {e["id"]: e["photo_id"] for e in rows["extractions"]}
    rec_rows = [dict(r, photo_id=photo_of[r["extraction_id"]]) for r in rec_rows]
    ov = photo_overlaps(rec_rows, PICKS, 0.85)
    assert ov[1] == (2 + 0 + 1) / 3 and ov[2] == 2


def test_a_different_prompt_version_is_not_scored_and_overlap_has_half_a_point_of_room():
    rows = good_rows()
    for r in rows["recommendations"]:
        r["prompt_version"] = "recommend_v1.md"  # not the default prompt: nothing to score
    m = measure(rows, CFG, "core", PICKS)
    assert m["choosing"]["median_overlap"] is None
    base = dict(BASE, choosing=dict(BASE["choosing"], median_overlap=2.5))
    m2, regressions = run(good_rows(), base)
    assert m2["choosing"]["median_overlap"] == 2 and regressions == []  # 2 against 2.5: within the half point
    base = dict(BASE, choosing=dict(BASE["choosing"], median_overlap=2.6))
    _, regressions = run(good_rows(), base)
    assert regressions == ["choosing.median_overlap: 2.0000 vs baseline 2.6000, 0.5 under allowed"]
