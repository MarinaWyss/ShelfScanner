"""Per-model aggregates over whatever rows exist. Pure aggregation over dicts; SQL-free on purpose
so the same functions can run on rows fetched any way.

    uv run python -m research.report            # both tables to stdout
    uv run python -m research.report --html f   # also write the visual report
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from statistics import mean, median

from shelfscanner.db import get_client


@dataclass(frozen=True)
class ExtractionStats:
    model: str
    long_edge: int
    photos: int  # distinct photos with a row without error (latest per photo)
    errors: int
    median_recall: float | None
    mean_invented: float | None
    p50_latency_ms: float | None
    mean_cost_usd: float | None
    failovers: int = 0  # rows answered by this model after the stage's primary failed (002 D8)
    adapter: str = "openrouter"  # rows before change 002 have no adapter column and were all OpenRouter


@dataclass(frozen=True)
class RecommendationStats:
    model: str
    runs: int  # distinct extractions with a row without error (latest per extraction)
    errors: int
    share_valid_vs_extraction: float | None
    share_valid_vs_ground_truth: float | None
    mean_specificity: float | None
    scored_runs: int
    p50_latency_ms: float | None
    mean_cost_usd: float | None
    failovers: int = 0
    adapter: str = "openrouter"


def _opt(fn, values):
    values = [v for v in values if v is not None]
    return fn(values) if values else None


def extraction_stats(rows: list[dict]) -> list[ExtractionStats]:
    groups: dict[tuple[str, str, int], list[dict]] = defaultdict(list)
    for r in rows:
        groups[(r["model"], r.get("adapter") or "openrouter", r["image_long_edge"])].append(r)
    out = []
    for (model, adapter, edge), rs in sorted(groups.items()):
        ok = latest_per_key([r for r in rs if not r.get("error")], "photo_id")
        errors = sum(1 for r in rs if r.get("error"))
        recalls = [r["found_count"] / (r["found_count"] + r["missed_count"])
                   for r in ok if r["found_count"] + r["missed_count"]]
        out.append(ExtractionStats(
            model=model, long_edge=edge, adapter=adapter, photos=len(ok), errors=errors,
            median_recall=_opt(median, recalls),
            mean_invented=_opt(mean, [r["invented_count"] for r in ok]),
            p50_latency_ms=_opt(median, [r["latency_ms"] for r in ok]),
            mean_cost_usd=_opt(mean, [r["cost_usd"] for r in ok]),
            failovers=sum(1 for r in rs if r.get("failover_from")),
        ))
    return out


def recommendation_stats(rows: list[dict]) -> list[RecommendationStats]:
    groups: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for r in rows:
        groups[(r["model"], r.get("adapter") or "openrouter")].append(r)
    out = []
    for (model, adapter), rs in sorted(groups.items()):
        ok = latest_per_key([r for r in rs if not r.get("error")], "extraction_id")
        errors = sum(1 for r in rs if r.get("error"))
        n_recs = [_count_recs(r) for r in ok]
        total = sum(n_recs)
        scored = [r for r in ok if r.get("specificity_scores")]
        all_scores = [s for r in scored for s in r["specificity_scores"]]
        out.append(RecommendationStats(
            model=model, adapter=adapter, runs=len(ok), errors=errors,
            share_valid_vs_extraction=(sum(r["valid_vs_extraction"] or 0 for r in ok) / total) if total else None,
            share_valid_vs_ground_truth=(sum(r["valid_vs_ground_truth"] or 0 for r in ok) / total) if total else None,
            mean_specificity=_opt(mean, all_scores),
            scored_runs=len(scored),
            p50_latency_ms=_opt(median, [r["latency_ms"] for r in ok]),
            mean_cost_usd=_opt(mean, [r["cost_usd"] for r in ok]),
            failovers=sum(1 for r in rs if r.get("failover_from")),
        ))
    return out


def latest_per_key(rows: list[dict], key: str) -> list[dict]:
    """A rerun of the same input under the same model supersedes the earlier row. Error rows are counted separately."""
    latest: dict = {}
    for r in sorted(rows, key=lambda r: r.get("id", 0)):
        latest[r.get(key, r.get("id"))] = r
    return list(latest.values())


def _count_recs(row: dict) -> int:
    parsed = row.get("parsed_recommendations")
    if isinstance(parsed, dict):
        return len(parsed.get("recommendations") or [])
    if isinstance(parsed, list):
        return len(parsed)
    return 0


def _f(v, fmt):
    return "-" if v is None else format(v, fmt)


def render(ex: list[ExtractionStats], rec: list[RecommendationStats]) -> str:
    lines = ["EXTRACTION  (per model and image long edge; metrics over rows without error)",
             f"{'model':<30}{'adapter':<11}{'edge':>6}{'photos':>8}{'errors':>8}{'recall':>8}{'invented':>10}{'p50 ms':>9}{'cost':>10}{'failover':>10}"]
    for s in ex:
        lines.append(f"{s.model:<30}{s.adapter:<11}{s.long_edge:>6}{s.photos:>8}{s.errors:>8}{_f(s.median_recall, '.2f'):>8}"
                     f"{_f(s.mean_invented, '.1f'):>10}{_f(s.p50_latency_ms, '.0f'):>9}{_f(s.mean_cost_usd, '.4f'):>10}{s.failovers:>10}")
    if not ex:
        lines.append("  (no rows)")
    lines += ["", "RECOMMENDATION  (per model; validity shares are over all recommended titles; specificity over scored rows)",
              f"{'model':<30}{'adapter':<11}{'runs':>6}{'errors':>8}{'vs extr':>9}{'vs truth':>10}{'specif':>8}{'scored':>8}{'p50 ms':>9}{'cost':>10}{'failover':>10}"]
    for s in rec:
        lines.append(f"{s.model:<30}{s.adapter:<11}{s.runs:>6}{s.errors:>8}{_f(s.share_valid_vs_extraction, '.2f'):>9}"
                     f"{_f(s.share_valid_vs_ground_truth, '.2f'):>10}{_f(s.mean_specificity, '.2f'):>8}{s.scored_runs:>8}"
                     f"{_f(s.p50_latency_ms, '.0f'):>9}{_f(s.mean_cost_usd, '.4f'):>10}{s.failovers:>10}")
    if not rec:
        lines.append("  (no rows)")
    return "\n".join(lines)


def fetch_and_render() -> str:
    """Only labelled photos count: a session upload (change 003) has no labels, so every title it
    reads would be scored as invented and would poison the per-model numbers."""
    c = get_client()
    labelled = {r["id"] for r in c.table("photos").select("id, titles").execute().data if r.get("titles")}
    ex = c.table("extractions").select(
        "id, photo_id, model, image_long_edge, error, found_count, missed_count, invented_count, latency_ms, cost_usd, failover_from, adapter").execute().data
    ex = [r for r in ex if r["photo_id"] in labelled]
    rec = c.table("recommendations").select(
        "id, extraction_id, model, error, parsed_recommendations, valid_vs_extraction, valid_vs_ground_truth, specificity_scores, latency_ms, cost_usd, failover_from, adapter"
    ).execute().data
    labelled_extractions = {r["id"] for r in ex}
    rec = [r for r in rec if r["extraction_id"] in labelled_extractions]
    from shelfscanner.web.metrics import save_rate  # change 005: the primary metric, over session scans

    return render(extraction_stats(ex), recommendation_stats(rec)) + "\n\nFEEDBACK  (scans from the app)\n" + save_rate().line()


def main() -> None:
    import argparse
    from pathlib import Path

    ap = argparse.ArgumentParser(prog="research.report", description="per-model aggregates for both stages")
    ap.add_argument("--html", type=Path, default=None, help="also write the visual comparison report to this file")
    args = ap.parse_args()
    print(fetch_and_render())
    if args.html:
        from research import html_report
        print(f"\nwrote {html_report.write(args.html)}")


if __name__ == "__main__":
    main()
