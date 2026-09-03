"""Per-model aggregates over whatever rows exist. Pure aggregation over dicts; SQL-free on purpose
so the same functions can run on rows fetched any way.

    uv run python -m research.report            # both tables to stdout
    uv run python -m research.report --html f   # also write the visual report
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from statistics import mean

from shelfscanner.db import get_client
from shelfscanner.web import metrics  # change 009 D1: one set of numbers for the report and the page


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
        stage = metrics.stage_stats("reading", ok + [r for r in rs if r.get("error")])
        recalls = [r["found_count"] / (r["found_count"] + r["missed_count"])
                   for r in ok if r["found_count"] + r["missed_count"]]
        out.append(ExtractionStats(
            model=model, long_edge=edge, adapter=adapter, photos=len(ok), errors=stage.errors,
            median_recall=metrics.percentile(recalls, 50),
            mean_invented=_opt(mean, [r["invented_count"] for r in ok]),
            p50_latency_ms=stage.p50_ms, mean_cost_usd=stage.cost_per_scan, failovers=stage.failovers,
        ))
    return out


def recommendation_stats(rows: list[dict]) -> list[RecommendationStats]:
    groups: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for r in rows:
        groups[(r["model"], r.get("adapter") or "openrouter")].append(r)
    out = []
    for (model, adapter), rs in sorted(groups.items()):
        ok = latest_per_key([r for r in rs if not r.get("error")], "extraction_id")
        stage = metrics.stage_stats("choosing", ok + [r for r in rs if r.get("error")])
        n_recs = [_count_recs(r) for r in ok]
        total = sum(n_recs)
        scored = [r for r in ok if r.get("specificity_scores")]
        all_scores = [s for r in scored for s in r["specificity_scores"]]
        out.append(RecommendationStats(
            model=model, adapter=adapter, runs=len(ok), errors=stage.errors,
            share_valid_vs_extraction=(sum(r["valid_vs_extraction"] or 0 for r in ok) / total) if total else None,
            share_valid_vs_ground_truth=(sum(r["valid_vs_ground_truth"] or 0 for r in ok) / total) if total else None,
            mean_specificity=_opt(mean, all_scores),
            scored_runs=len(scored),
            p50_latency_ms=stage.p50_ms, mean_cost_usd=stage.cost_per_scan, failovers=stage.failovers,
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
    from shelfscanner.config import load_config
    from shelfscanner.web.metrics import price_check, save_rate  # 005: the primary metric; 002 D5: price staleness

    return (render(extraction_stats(ex), recommendation_stats(rec)) + "\n\nFEEDBACK  (scans from the app)\n"
            + save_rate().line() + "\n\n" + price_line(price_check(load_config().prices_checked)))


def price_line(check) -> str:
    """002 D5: the config prices carry a checked-on date; say so when it is older than 90 days."""
    if check.checked is None:
        return "PRICES  no prices_checked date in config/models.toml"
    state = "STALE, check them" if check.stale else "ok"
    return f"PRICES  checked {check.checked.isoformat()}, {check.age_days} days ago: {state}"


# --- change 011: prompt versions side by side ---------------------------------------------------


@dataclass
class PromptStats:
    prompt: str
    prefs: str  # "export" when the preferences carried rated books, else "flat"
    adapter: str
    runs: int
    errors: int
    on_list: float | None  # picks on the list over all picks of the ok runs (R1)
    overlap: dict[int, int]  # photo id -> overlap with Marina's picks, latest run per photo
    mean_overlap: float | None
    median_overlap: float | None
    p50_latency_ms: float | None
    mean_cost_usd: float | None


def prefs_shape(preferences: dict | None) -> str:
    return "export" if (preferences or {}).get("rated_books") else "flat"


def by_prompt(recs: list[dict], photo_of: dict[int, int], picks: dict[int, list], threshold: float,
              summary_photos: list[int] | None = None) -> list[PromptStats]:
    """One row per (prompt version, preferences shape, adapter) over the latest run per photo. `recs` are
    recommendation rows of one model; `photo_of` maps extraction id to photo id. The overlap is
    `research.check.overlap` against the picks file; the mean and median are over `summary_photos`
    (default: every photo with picks)."""
    from research.check import overlap
    from shelfscanner.recommend import recs_from

    groups: dict[tuple[str, str, str], list[dict]] = defaultdict(list)
    for r in recs:
        if r["extraction_id"] not in photo_of:
            continue
        key = ((r.get("prompt_version") or "?").removesuffix(".md"), prefs_shape(r.get("preferences")),
               r.get("adapter") or "openrouter")
        groups[key].append(dict(r, photo_id=photo_of[r["extraction_id"]]))
    out = []
    for (prompt, shape, adapter), rs in sorted(groups.items()):
        ok = latest_per_key([r for r in rs if not r.get("error")], "photo_id")
        stage = metrics.stage_stats("choosing", ok + [r for r in rs if r.get("error")])
        n_recs = [_count_recs(r) for r in ok]
        total = sum(n_recs)
        ov = {r["photo_id"]: overlap([x.title for x in recs_from(r["parsed_recommendations"])],
                                     picks[r["photo_id"]], threshold)
              for r in ok if picks.get(r["photo_id"])}
        chosen = [ov[p] for p in (summary_photos or sorted(ov)) if p in ov]
        out.append(PromptStats(
            prompt=prompt, prefs=shape, adapter=adapter, runs=len(ok), errors=stage.errors,
            on_list=(sum(r["valid_vs_extraction"] or 0 for r in ok) / total) if total else None,
            overlap=ov, mean_overlap=mean(chosen) if chosen else None,
            median_overlap=metrics.percentile(chosen, 50) if chosen else None,
            p50_latency_ms=stage.p50_ms, mean_cost_usd=stage.cost_per_scan,
        ))
    return out


def render_by_prompt(stats: list[PromptStats], model: str, summary_photos: list[int] | None) -> str:
    photos = sorted({p for s in stats for p in s.overlap})
    which = ", ".join(str(p) for p in summary_photos) if summary_photos else "every photo with picks"
    head = (f"PROMPTS  (choosing model {model}; latest run per photo and prompt; overlap = picks that match "
            f"Marina's own for that shelf; mean and median over photos {which})")
    cols = f"{'prompt':<14}{'prefs':<8}{'adapter':<11}{'runs':>5}{'errors':>7}{'on-list':>9}"
    cols += "".join(f"{'p' + str(p):>5}" for p in photos) + f"{'mean':>7}{'median':>8}{'p50 ms':>9}{'cost':>9}"
    lines = [head, cols]
    for s in stats:
        line = f"{s.prompt:<14}{s.prefs:<8}{s.adapter:<11}{s.runs:>5}{s.errors:>7}{_f(s.on_list, '.2f'):>9}"
        line += "".join(f"{(str(s.overlap[p]) if p in s.overlap else '-'):>5}" for p in photos)
        line += (f"{_f(s.mean_overlap, '.2f'):>7}{_f(s.median_overlap, '.1f'):>8}"
                 f"{_f(s.p50_latency_ms, '.0f'):>9}{_f(s.mean_cost_usd, '.4f'):>9}")
        lines.append(line)
    if not stats:
        lines.append("  (no rows)")
    return "\n".join(lines)


def fetch_and_render_by_prompt(set_name: str = "core", summary_photos: list[int] | None = None) -> str:
    from research.check import load_picks, photos_in_set
    from shelfscanner.config import load_config

    cfg = load_config()
    model = cfg.model(cfg.stage("choosing").primary).slug
    c = get_client()
    photos = photos_in_set(c.table("photos").select("id, titles, set").execute().data, set_name)
    ex = c.table("extractions").select("id, photo_id").in_("photo_id", list(photos)).execute().data
    photo_of = {e["id"]: e["photo_id"] for e in ex}
    recs = c.table("recommendations").select(
        "id, extraction_id, model, adapter, prompt_version, preferences, parsed_recommendations, "
        "valid_vs_extraction, error, latency_ms, cost_usd").eq("model", model).in_("extraction_id", list(photo_of)).execute().data
    stats = by_prompt(recs, photo_of, load_picks(), cfg.match_threshold, summary_photos)
    return render_by_prompt(stats, model.split("/")[-1], summary_photos)


def main() -> None:
    import argparse
    from pathlib import Path

    ap = argparse.ArgumentParser(prog="research.report", description="per-model aggregates for both stages")
    ap.add_argument("--html", type=Path, default=None, help="also write the visual comparison report to this file")
    ap.add_argument("--by-prompt", action="store_true",
                    help="prompt versions side by side for the configured choosing model (011)")
    ap.add_argument("--set", default="core", help="photo set for --by-prompt (default core)")
    ap.add_argument("--photos", default=None,
                    help="comma-separated photo ids the --by-prompt mean and median are over, e.g. 1,2,3,4")
    args = ap.parse_args()
    if args.by_prompt:
        summary = [int(x) for x in args.photos.split(",")] if args.photos else None
        print(fetch_and_render_by_prompt(args.set, summary))
        return
    print(fetch_and_render())
    if args.html:
        from research import html_report
        print(f"\nwrote {html_report.write(args.html)}")


if __name__ == "__main__":
    main()
