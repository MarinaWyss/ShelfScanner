"""The regression gate (change 002, D6 and D9): the report for the models named as primary in
config/models.toml, compared to research/baseline.json. Exits non-zero naming every metric that
regressed.

    uv run python -m research.check                  # the core set, human-readable
    uv run python -m research.check --set core --json

Aggregation is research.report's, over the labelled photos of one set, latest row per photo.
Recall, invented, on-list share and overlap must not drop at all; p50 latency and cost per
stage and per scan may rise by at most TOLERANCE. A photo of the set with no error-free row for
a primary is a failure too, so a gap cannot hide behind a better median.
"""

from __future__ import annotations

import argparse
import json
from dataclasses import asdict
from pathlib import Path
from statistics import median

from research.report import extraction_stats, latest_per_key, recommendation_stats
from shelfscanner.config import Config, load_config
from shelfscanner.matching import similarity
from shelfscanner.recommend import recs_from
from shelfscanner.settings import DATA_DIR

BASELINE_PATH = Path(__file__).with_name("baseline.json")
PICKS_PATH = DATA_DIR / "prefs" / "marina_picks.json"
TOLERANCE = 0.10  # on latency and cost only

# Compared metrics per stage, with which way is better. Latency and cost get the tolerance.
READING_METRICS = {"median_recall": "higher", "mean_invented": "lower", "p50_latency_ms": "lower", "mean_cost_usd": "lower"}
CHOOSING_METRICS = {"share_valid_vs_extraction": "higher", "median_overlap": "higher",
                    "p50_latency_ms": "lower", "mean_cost_usd": "lower"}
TOLERATED = {"p50_latency_ms", "mean_cost_usd", "cost_per_scan_usd"}
_EPS = 1e-9


def photos_in_set(photos: list[dict], set_name: str) -> dict[int, dict]:
    """Labelled photos of one set, by id. A photo without a `set` is core (006 contract)."""
    return {p["id"]: p for p in photos if p.get("titles") and (p.get("set") or "core") == set_name}


def load_picks(path: Path = PICKS_PATH) -> dict[int, list]:
    if not path.exists():
        return {}
    return {int(k): v for k, v in json.loads(path.read_text()).items() if k != "_note"}


def overlap(rec_titles: list[str], picks: list, threshold: float) -> int:
    """Picks satisfied by a run's titles; a pick given as a list is satisfied by any of its titles.
    Same rule as the visual report (docs/specs/recommendation.md)."""
    hit = 0
    for pick in picks:
        alts = pick if isinstance(pick, list) else [pick]
        if any(similarity(t, a) >= threshold for t in rec_titles for a in alts):
            hit += 1
    return min(hit, len(rec_titles))


def measure(rows: dict[str, list[dict]], cfg: Config, set_name: str, picks: dict[int, list]) -> dict:
    """The numbers for the primaries on one set. `rows` holds `photos`, `extractions` and `recommendations`
    as fetched (or hand-built); nothing here touches the database."""
    reading_model = cfg.model(cfg.stage("reading").primary).slug
    choosing_model = cfg.model(cfg.stage("choosing").primary).slug
    edge = cfg.default_max_edge
    photos = photos_in_set(rows["photos"], set_name)

    ex = [r for r in rows["extractions"] if r["photo_id"] in photos]
    ex_stats = extraction_stats([r for r in ex if r["model"] == reading_model and r["image_long_edge"] == edge])
    reading = asdict(ex_stats[0]) if ex_stats else {"model": reading_model, "long_edge": edge, "photos": 0, "errors": 0}

    # A recommendation belongs to the photo of its extraction, whichever model made that extraction;
    # the latest run per photo counts, as the latest extraction per photo does above.
    photo_of = {r["id"]: r["photo_id"] for r in ex}
    rec = [dict(r, photo_id=photo_of[r["extraction_id"]]) for r in rows["recommendations"]
           if r["model"] == choosing_model and r["extraction_id"] in photo_of]
    ok = latest_per_key([r for r in rec if not r.get("error")], "photo_id")
    rec_stats = recommendation_stats(ok + [r for r in rec if r.get("error")])
    choosing = asdict(rec_stats[0]) if rec_stats else {"model": choosing_model, "runs": 0, "errors": 0}
    overlaps = [overlap([x.title for x in recs_from(r["parsed_recommendations"])], picks[r["photo_id"]], cfg.match_threshold)
                for r in ok if picks.get(r["photo_id"])]
    choosing["median_overlap"] = median(overlaps) if overlaps else None
    choosing["overlap_runs"] = len(overlaps)

    costs = [reading.get("mean_cost_usd"), choosing.get("mean_cost_usd")]
    return {
        "set": set_name,
        "photos": len(photos),
        "reading": reading,
        "choosing": choosing,
        "cost_per_scan_usd": sum(costs) if all(c is not None for c in costs) else None,
    }


def _regressed(got: float, want: float, better: str, tolerance: float) -> bool:
    if better == "higher":
        return got < want * (1 - tolerance) - _EPS
    return got > want * (1 + tolerance) + _EPS


def _fmt(v: float | None) -> str:
    if v is None:
        return "none"
    if isinstance(v, float):
        return f"{v:.4f}" if abs(v) < 10 else f"{v:.0f}"
    return f"{v:g}"


def compare(measured: dict, baseline: dict, tolerance: float = TOLERANCE) -> list[str]:
    """Every regression of `measured` against one set's baseline, one line each. Empty means pass."""
    out: list[str] = []
    n = measured["photos"]
    if n == 0:
        return [f"no labelled photos in set {measured['set']!r}"]
    checks: list[tuple[str, str, str, float | None, float | None]] = []
    for stage, metrics, count in (("reading", READING_METRICS, "photos"), ("choosing", CHOOSING_METRICS, "runs")):
        got, want = measured[stage], baseline[stage]
        if got[count] < n:
            out.append(f"{stage}: {got[count]} of {n} photos have a row without error for {got['model']}")
        checks += [(f"{stage}.{m}", better, m, got.get(m), want.get(m)) for m, better in metrics.items()]
    checks.append(("cost_per_scan_usd", "lower", "cost_per_scan_usd", measured["cost_per_scan_usd"], baseline.get("cost_per_scan_usd")))
    for name, better, metric, got, want in checks:
        if want is None:
            continue
        if got is None:
            out.append(f"{name}: no value (baseline {_fmt(want)})")
            continue
        tol = tolerance if metric in TOLERATED else 0.0
        if _regressed(got, want, better, tol):
            allowed = f", {tol:.0%} allowed" if tol else ""
            out.append(f"{name}: {_fmt(got)} vs baseline {_fmt(want)}{allowed}")
    return out


def render(measured: dict, baseline: dict, regressions: list[str]) -> str:
    def pair(stage: dict, base: dict, metric: str) -> str:
        return f"{_fmt(stage.get(metric))} (base {_fmt(base.get(metric))})"

    r, b = measured["reading"], baseline["reading"]
    c, cb = measured["choosing"], baseline["choosing"]
    lines = [f"check: set {measured['set']}, {measured['photos']} labelled photos, latest row per photo"]
    for stage, base in (("reading", b), ("choosing", cb)):
        if measured[stage]["model"] != base["model"]:
            lines.append(f"note: {stage} primary is {measured[stage]['model']}; baseline numbers are {base['model']}'s (D6)")
    lines += [
        f"reading   {r['model']:<28} recall {pair(r, b, 'median_recall')}  invented {pair(r, b, 'mean_invented')}  "
        f"p50 ms {pair(r, b, 'p50_latency_ms')}  cost {pair(r, b, 'mean_cost_usd')}  rows {r['photos']}, errors {r['errors']}",
        f"choosing  {c['model']:<28} on-list {pair(c, cb, 'share_valid_vs_extraction')}  overlap {pair(c, cb, 'median_overlap')}  "
        f"p50 ms {pair(c, cb, 'p50_latency_ms')}  cost {pair(c, cb, 'mean_cost_usd')}  rows {c['runs']}, errors {c['errors']}",
        f"scan      cost {_fmt(measured['cost_per_scan_usd'])} (base {_fmt(baseline.get('cost_per_scan_usd'))})",
    ]
    if regressions:
        lines += ["REGRESSION"] + [f"  {x}" for x in regressions]
    else:
        lines.append(f"PASS  (latency and cost within {TOLERANCE:.0%} of baseline, nothing else lower)")
    return "\n".join(lines)


def load_baseline(path: Path = BASELINE_PATH) -> dict:
    return json.loads(path.read_text())


def baseline_for(set_name: str, path: Path = BASELINE_PATH) -> dict:
    sets = load_baseline(path).get("sets", {})
    if set_name not in sets:
        raise SystemExit(f"No baseline for set {set_name!r} in {path}. Known: {', '.join(sets) or 'none'}")
    return sets[set_name]


def fetch() -> dict[str, list[dict]]:
    from shelfscanner.db import get_client

    c = get_client()
    return {
        "photos": c.table("photos").select("*").order("id").execute().data,
        "extractions": c.table("extractions").select(
            "id, photo_id, model, image_long_edge, error, found_count, missed_count, invented_count, latency_ms, cost_usd"
        ).order("id").execute().data,
        "recommendations": c.table("recommendations").select(
            "id, extraction_id, model, error, parsed_recommendations, valid_vs_extraction, valid_vs_ground_truth, "
            "specificity_scores, latency_ms, cost_usd"
        ).order("id").execute().data,
    }


def run(set_name: str, rows: dict[str, list[dict]], *, cfg: Config | None = None, baseline: dict | None = None,
        picks: dict[int, list] | None = None) -> tuple[dict, dict, list[str]]:
    """Measure and compare. Returns (measured, baseline, regressions)."""
    cfg = cfg or load_config()
    baseline = baseline or baseline_for(set_name)
    measured = measure(rows, cfg, set_name, load_picks() if picks is None else picks)
    return measured, baseline, compare(measured, baseline)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="research.check", description="the primaries' report against the committed baseline")
    ap.add_argument("--set", default="core", help="photo set to measure and the baseline entry to compare to")
    ap.add_argument("--json", action="store_true", help="print the numbers as JSON instead of the table")
    args = ap.parse_args(argv)
    measured, baseline, regressions = run(args.set, fetch())
    if args.json:
        print(json.dumps({"measured": measured, "baseline": baseline, "regressions": regressions}, indent=2))
    else:
        print(render(measured, baseline, regressions))
    return 1 if regressions else 0


if __name__ == "__main__":
    raise SystemExit(main())
