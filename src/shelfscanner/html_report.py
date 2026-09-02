"""Visual comparison report for the spike, generated from the logged rows.

`shelfscanner report --html <file>` writes a self-contained page: what was
tested, each model's extraction quality, cost and latency, and separately
its recommendation quality, so the vision and language model can be chosen
independently. No photos are embedded; they may show private rooms.
"""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path
from statistics import mean, median

from shelfscanner.config import load_config
from shelfscanner.db import get_client
from shelfscanner.extract import titles_from
from shelfscanner.recommend import recs_from
from shelfscanner.matching import similarity
from shelfscanner.report import latest_per_key
from shelfscanner.settings import DATA_DIR

PICKS_PATH = DATA_DIR / "prefs" / "marina_picks.json"

# Pass lines from proposal "How we know it worked".
CRITERIA = {
    "recall": 0.80, "invented_per_photo": 1.0, "valid_vs_truth_median": 4, "overlap_median": 3,
    "cost_per_scan": 0.05, "p50_seconds": 15.0,
}


def _recall(r: dict) -> float | None:
    total = r["found_count"] + r["missed_count"]
    return r["found_count"] / total if total else None


def collect() -> dict:
    cfg = load_config()
    c = get_client()
    photos = c.table("photos").select("id, storage_path, titles, partial_titles, notes").order("id").execute().data
    ex_all = c.table("extractions").select("*").order("id").execute().data
    rec_all = c.table("recommendations").select("*").order("id").execute().data
    by_slug = {m.slug: m for m in cfg.models.values()}
    picks: dict[int, list[str]] = {}
    if PICKS_PATH.exists():
        picks = {int(k): v for k, v in json.loads(PICKS_PATH.read_text()).items() if k != "_note"}

    def overlap(rec_titles: list[str], photo_id: int) -> int | None:
        """Picks satisfied by the recommendation. A pick given as a list is satisfied by any of its titles."""
        mine = picks.get(photo_id)
        if not mine:
            return None
        hit = 0
        for m in mine:
            alts = m if isinstance(m, list) else [m]
            if any(similarity(t, a) >= cfg.match_threshold for t in rec_titles for a in alts):
                hit += 1
        return min(hit, len(rec_titles))

    def flat_picks(photo_id: int) -> list[str]:
        return [a for m in picks.get(photo_id, []) for a in (m if isinstance(m, list) else [m])]

    # Extraction: latest row per (model, edge, photo); errors counted per (model, edge).
    groups: dict[tuple[str, int], list[dict]] = {}
    for r in ex_all:
        groups.setdefault((r["model"], r["image_long_edge"]), []).append(r)
    ex_rows, ex_stats = [], []
    for (slug, edge), rs in sorted(groups.items(), key=lambda kv: (by_slug.get(kv[0][0]).alias if kv[0][0] in by_slug else kv[0][0], kv[0][1])):
        ok = sorted(latest_per_key([r for r in rs if not r["error"]], "photo_id"), key=lambda r: r["photo_id"])
        errors = [r for r in rs if r["error"]]
        for r in ok:
            ex_rows.append({
                "id": r["id"], "photo_id": r["photo_id"], "model": slug, "edge": edge, "provider": r["provider"],
                "found": r["found"], "missed": r["missed"], "invented": r["invented"], "partial": r["partial_matched"],
                "extracted": titles_from(r["parsed_titles"]),
                "recall": _recall(r), "latency_ms": r["latency_ms"], "cost_usd": r["cost_usd"],
                "input_tokens": r["input_tokens"], "output_tokens": r["output_tokens"],
            })
        recalls = [x for x in (_recall(r) for r in ok) if x is not None]
        ex_stats.append({
            "model": slug, "edge": edge, "photos": len(ok), "errors": len(errors),
            "error_kinds": sorted({e["error"].split(":")[0] for e in errors}),
            "median_recall": median(recalls) if recalls else None,
            "mean_invented": mean(r["invented_count"] for r in ok) if ok else None,
            "total_invented": sum(r["invented_count"] for r in ok),
            "p50_latency_ms": median(r["latency_ms"] for r in ok) if ok else None,
            "mean_cost_usd": mean(r["cost_usd"] for r in ok) if ok else None,
        })

    # Best extraction per photo (highest recall, fewest invented, earliest), the input to stage two.
    best: dict[int, dict] = {}
    for r in ex_all:
        if r["error"]:
            continue
        key = (-(_recall(r) or 0), r["invented_count"], r["id"])
        if r["photo_id"] not in best or key < best[r["photo_id"]][0]:
            best[r["photo_id"]] = (key, r)
    best_ids = {pid: v[1]["id"] for pid, v in best.items()}
    best_meta = {v[1]["id"]: {"photo_id": pid, "model": v[1]["model"], "edge": v[1]["image_long_edge"],
                              "found": v[1]["found_count"], "invented": v[1]["invented_count"]} for pid, v in best.items()}

    matrix = [r for r in rec_all if r["extraction_id"] in best_meta]
    rec_groups: dict[str, list[dict]] = {}
    for r in matrix:
        rec_groups.setdefault(r["model"], []).append(r)
    rec_rows, rec_stats = [], []
    for slug, rs in sorted(rec_groups.items(), key=lambda kv: by_slug.get(kv[0]).alias if kv[0] in by_slug else kv[0]):
        ok = sorted(latest_per_key([r for r in rs if not r["error"]], "extraction_id"),
                    key=lambda r: best_meta[r["extraction_id"]]["photo_id"])
        errors = [r for r in rs if r["error"]]
        for r in ok:
            pid = best_meta[r["extraction_id"]]["photo_id"]
            r["_overlap"] = overlap([x.title for x in recs_from(r["parsed_recommendations"])], pid)
            rec_rows.append({
                "id": r["id"], "extraction_id": r["extraction_id"], "photo_id": pid, "overlap": r["_overlap"],
                "model": slug, "provider": r["provider"],
                "recs": [{"title": x.title, "reason": x.reason} for x in recs_from(r["parsed_recommendations"])],
                "valid_vs_extraction": r["valid_vs_extraction"], "valid_vs_ground_truth": r["valid_vs_ground_truth"],
                "specificity": r["specificity_scores"], "latency_ms": r["latency_ms"], "cost_usd": r["cost_usd"],
                "output_tokens": r["output_tokens"],
            })
        n_total = sum(len(recs_from(r["parsed_recommendations"])) for r in ok)
        scores = [s for r in ok if r["specificity_scores"] for s in r["specificity_scores"]]
        overlaps = [r["_overlap"] for r in ok if r.get("_overlap") is not None]
        rec_stats.append({
            "model": slug, "runs": len(ok), "errors": len(errors),
            "all_valid_vs_extraction": all(r["valid_vs_extraction"] == len(recs_from(r["parsed_recommendations"])) for r in ok),
            "share_valid_vs_truth": (sum(r["valid_vs_ground_truth"] for r in ok) / n_total) if n_total else None,
            "median_valid_vs_truth": median(r["valid_vs_ground_truth"] for r in ok) if ok else None,
            "mean_specificity": mean(scores) if scores else None, "scored_runs": sum(1 for r in ok if r["specificity_scores"]),
            "median_overlap": median(overlaps) if overlaps else None, "mean_overlap": mean(overlaps) if overlaps else None,
            "overlap_runs": len(overlaps),
            "p50_latency_ms": median(r["latency_ms"] for r in ok) if ok else None,
            "mean_cost_usd": mean(r["cost_usd"] for r in ok) if ok else None,
        })

    return {
        "generated": date.today().isoformat(),
        "criteria": CRITERIA,
        "settings": {"match_threshold": cfg.match_threshold, "default_max_edge": cfg.default_max_edge,
                     "extract_prompt": "extract_v1.md", "recommend_prompt": "recommend_v1.md"},
        "models": [{"alias": m.alias, "slug": m.slug, "provider": m.provider, "price_input": m.price_input,
                    "price_output": m.price_output, "reasoning_effort": m.reasoning_effort} for m in cfg.models.values()],
        "photos": [{"id": p["id"], "stem": Path(p["storage_path"]).stem, "titles": p["titles"],
                    "partial": p["partial_titles"], "notes": p["notes"], "picks": flat_picks(p["id"]), "picks_all": len(picks.get(p["id"], [])) >= len(p["titles"])} for p in photos],
        "extraction": {"rows": ex_rows, "stats": ex_stats},
        "best_extraction": best_meta,
        "recommendation": {"rows": rec_rows, "stats": rec_stats},
        "totals": {"extraction_calls": len(ex_all), "recommendation_calls": len(rec_all),
                   "spend_usd": sum((r["cost_usd"] or 0) for r in ex_all) + sum((r["cost_usd"] or 0) for r in rec_all)},
    }


def write(path: Path) -> Path:
    data = collect()
    html = TEMPLATE.replace("__DATA__", json.dumps(data, ensure_ascii=False).replace("</", "<\\/"))
    path.write_text(html)
    return path


TEMPLATE = r"""<title>Shelf Reading Trials</title>
<meta name="description" content="Five models read five shelves: extraction quality, cost and latency, and recommendation quality, scored separately.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;1,8..60,400&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
:root {
  color-scheme: light;
  --paper: #f3f4f1; --paper-2: #e9ebe6; --ink: #181b19; --ink-2: #565d59; --ink-3: #8b928e;
  --rule: #d3d7d2; --accent: #23694f; --accent-ink: #ffffff; --accent-soft: #dcebe3;
  --bar: #23694f; --bar-ctx: #b4bcb7; --grid: #dfe3de;
  --good: #0c8a2c; --good-soft: #dff3e3; --bad: #c73a3a; --bad-soft: #f9e1e1; --warn: #a86b00; --warn-soft: #f7ebcf;
  --shadow: 0 1px 0 rgba(24,27,25,.06);
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    color-scheme: dark;
    --paper: #171917; --paper-2: #202321; --ink: #eceeea; --ink-2: #b3bab5; --ink-3: #7d857f;
    --rule: #333835; --accent: #5fb894; --accent-ink: #0f1a15; --accent-soft: #1d3a2e;
    --bar: #5fb894; --bar-ctx: #4a524d; --grid: #2b302d;
    --good: #57c774; --good-soft: #1b3323; --bad: #ef7373; --bad-soft: #3d1f1f; --warn: #e4b04e; --warn-soft: #3b2f14;
    --shadow: none;
  }
}
:root[data-theme="dark"] {
  color-scheme: dark;
  --paper: #171917; --paper-2: #202321; --ink: #eceeea; --ink-2: #b3bab5; --ink-3: #7d857f;
  --rule: #333835; --accent: #5fb894; --accent-ink: #0f1a15; --accent-soft: #1d3a2e;
  --bar: #5fb894; --bar-ctx: #4a524d; --grid: #2b302d;
  --good: #57c774; --good-soft: #1b3323; --bad: #ef7373; --bad-soft: #3d1f1f; --warn: #e4b04e; --warn-soft: #3b2f14;
  --shadow: none;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--paper); color: var(--ink); font-family: "Source Serif 4", Georgia, "Times New Roman", serif; font-size: 17px; line-height: 1.55; }
.wrap { max-width: 1100px; margin: 0 auto; padding: 48px 28px 96px; }
h1, h2, h3 { font-family: "Bricolage Grotesque", "Helvetica Neue", Arial, sans-serif; font-weight: 700; letter-spacing: -0.01em; text-wrap: balance; margin: 0; }
h1 { font-size: clamp(38px, 6vw, 64px); line-height: 1; font-variation-settings: "opsz" 96; }
h2 { font-size: 28px; line-height: 1.15; }
h3 { font-size: 18px; font-weight: 700; }
p { max-width: 68ch; }
.mono, .num, .chip, .eyebrow, table, .cmds, .tab, .picker button { font-family: "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace; }
.num { font-variant-numeric: tabular-nums; }
.eyebrow { font-size: 12px; letter-spacing: .12em; text-transform: uppercase; color: var(--ink-2); }
.lede { font-size: 20px; color: var(--ink-2); max-width: 60ch; }
header.masthead { display: grid; grid-template-columns: 1fr; gap: 18px; padding-bottom: 32px; border-bottom: 2px solid var(--ink); margin-bottom: 40px; }
.masthead .meta { display: flex; flex-wrap: wrap; gap: 8px 28px; font-size: 13px; color: var(--ink-2); }
.masthead .meta b { color: var(--ink); font-weight: 500; }
section { margin: 56px 0 0; display: grid; grid-template-columns: 72px 1fr; gap: 12px 24px; }
section > .spine { border-right: 1px solid var(--rule); padding-right: 12px; }
section > .spine .eyebrow { writing-mode: vertical-rl; transform: rotate(180deg); display: inline-block; white-space: nowrap; }
section > .body { min-width: 0; }
section h2 { margin-bottom: 8px; }
section .body > p:first-of-type { margin-top: 0; }
@media (max-width: 720px) { section { grid-template-columns: 1fr; } section > .spine { border: 0; padding: 0; } section > .spine .eyebrow { writing-mode: horizontal-tb; transform: none; } }

.verdict { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px; margin: 24px 0 0; }
.verdict .card { background: var(--paper-2); padding: 18px 20px; border-left: 4px solid var(--accent); }
.verdict .card h3 { margin-bottom: 6px; }
.verdict .card p { margin: 0; font-size: 15px; color: var(--ink-2); }
.verdict .card .pick { font-family: "Bricolage Grotesque", sans-serif; font-size: 24px; font-weight: 700; margin: 2px 0 6px; }

.two { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 28px; }
table { border-collapse: collapse; width: 100%; font-size: 13.5px; }
th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--rule); vertical-align: top; }
th { font-weight: 500; color: var(--ink-2); font-size: 12px; letter-spacing: .06em; text-transform: uppercase; }
td.r, th.r { text-align: right; }
.tablewrap { overflow-x: auto; }
.notes { font-family: "Source Serif 4", serif; font-size: 14px; color: var(--ink-2); }

.charts { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 20px 28px; margin: 20px 0 8px; }
.chart h3 { font-size: 14px; font-weight: 500; font-family: "IBM Plex Mono", monospace; color: var(--ink-2); margin-bottom: 6px; letter-spacing: .02em; }
.chart svg { width: 100%; height: auto; display: block; overflow: visible; }
.chart .lbl { font-family: "IBM Plex Mono", monospace; font-size: 12px; fill: var(--ink-2); }
.chart .val { font-family: "IBM Plex Mono", monospace; font-size: 12px; fill: var(--ink); font-variant-numeric: tabular-nums; }
.chart .bar { fill: var(--bar-ctx); }
.chart .bar.emph { fill: var(--bar); }
.chart .bar.fail { fill: var(--bad); opacity: .75; }
.chart .target { stroke: var(--ink-3); stroke-width: 1; stroke-dasharray: 3 3; }
.chart .tlabel { font-family: "IBM Plex Mono", monospace; font-size: 11px; fill: var(--ink-3); }
.chart .axis { stroke: var(--rule); }
.legend { display: flex; flex-wrap: wrap; gap: 6px 18px; font-size: 12.5px; color: var(--ink-2); margin: 4px 0 20px; font-family: "IBM Plex Mono", monospace; }
.legend i { display: inline-block; width: 12px; height: 12px; vertical-align: -2px; margin-right: 6px; }
.legend .emph i { background: var(--bar); } .legend .ctx i { background: var(--bar-ctx); } .legend .fail i { background: var(--bad); opacity: .75; }
.legend .tgt i { width: 16px; height: 0; border-top: 2px dashed var(--ink-3); vertical-align: 3px; }

.matrix td.cell { cursor: pointer; }
.matrix td.cell:hover, .matrix td.cell.active { background: var(--accent-soft); }
.matrix td.cell:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.matrix .frac { font-weight: 500; }
.matrix .inv { display: inline-block; margin-left: 6px; padding: 0 6px; border-radius: 3px; background: var(--bad-soft); color: var(--bad); font-size: 11.5px; }
.matrix .inv.zero { background: transparent; color: var(--ink-3); }
.matrix .sub { display: block; font-size: 11px; color: var(--ink-3); }
.detail { background: var(--paper-2); padding: 18px 20px; margin-top: 12px; }
.detail:empty { display: none; }
.detail h3 { margin-bottom: 10px; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0 14px; }
.chip { font-size: 12.5px; padding: 3px 9px; border-radius: 3px; border: 1px solid transparent; }
.chip.found { background: var(--good-soft); color: var(--good); }
.chip.invented { background: var(--bad-soft); color: var(--bad); }
.chip.missed { background: transparent; color: var(--ink-2); border-color: var(--rule); text-decoration: line-through; text-decoration-color: var(--ink-3); }
.chip.partial { background: transparent; color: var(--ink-2); border-style: dashed; border-color: var(--ink-3); }
.chiplegend { display: flex; flex-wrap: wrap; gap: 14px; font-size: 12.5px; color: var(--ink-2); margin: 8px 0 0; }

.tabs { display: flex; flex-wrap: wrap; gap: 6px; margin: 16px 0 12px; }
.tab { font-size: 13px; padding: 6px 12px; border: 1px solid var(--rule); background: transparent; color: var(--ink); cursor: pointer; border-radius: 3px; }
.tab[aria-selected="true"] { background: var(--ink); color: var(--paper); border-color: var(--ink); }
.tab:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.shelf { font-size: 13.5px; color: var(--ink-2); margin: 0 0 14px; }
.reccols { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 18px; }
.reccol { background: var(--paper-2); padding: 16px 18px; }
.reccol header { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; margin-bottom: 8px; }
.reccol header h3 { font-family: "IBM Plex Mono", monospace; font-weight: 500; font-size: 13.5px; }
.reccol header .stat { font-size: 12px; color: var(--ink-2); font-family: "IBM Plex Mono", monospace; white-space: nowrap; }
.pick { padding: 10px 0; border-top: 1px solid var(--rule); }
.pick:first-of-type { border-top: 0; }
.pick .t { font-weight: 600; font-size: 15.5px; }
.pick .t.off { color: var(--bad); }
.pick .t .tag { font-family: "IBM Plex Mono", monospace; font-size: 11px; font-weight: 400; margin-left: 6px; color: var(--warn); }
.pick .t .tag.mine { color: var(--good); }
.pick .why { font-size: 14px; color: var(--ink-2); margin: 3px 0 6px; }
.picker { display: flex; gap: 4px; align-items: center; }
.picker span { font-size: 11px; color: var(--ink-3); margin-right: 4px; letter-spacing: .06em; }
.picker button { font-size: 12px; width: 28px; height: 24px; border: 1px solid var(--rule); background: transparent; color: var(--ink-2); cursor: pointer; border-radius: 3px; }
.picker button[aria-pressed="true"] { background: var(--accent); color: var(--accent-ink); border-color: var(--accent); }
.picker button:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.cmds { width: 100%; min-height: 120px; font-size: 12.5px; background: var(--paper-2); color: var(--ink); border: 1px solid var(--rule); padding: 12px; resize: vertical; }
.hint { font-size: 14px; color: var(--ink-2); }
.crit td.pass { color: var(--good); font-weight: 500; } .crit td.fail { color: var(--bad); font-weight: 500; } .crit td.pending { color: var(--warn); font-weight: 500; }
.rubric { font-size: 14px; color: var(--ink-2); margin: 8px 0 0; }
.rubric b { color: var(--ink); font-weight: 600; }
.foot { margin-top: 56px; padding-top: 16px; border-top: 1px solid var(--rule); font-size: 13px; color: var(--ink-3); }
@media (prefers-reduced-motion: no-preference) { .matrix td.cell, .tab, .picker button { transition: background-color .12s; } }
</style>

<div class="wrap">
<header class="masthead">
  <div class="eyebrow">ShelfScanner · change 001 · model comparison</div>
  <h1>Shelf Reading Trials</h1>
  <p class="lede" id="lede"></p>
  <div class="meta" id="meta"></div>
</header>

<div class="verdict" id="verdict"></div>

<section id="tested">
  <div class="spine"><span class="eyebrow">What was tested</span></div>
  <div class="body">
    <h2>Five shelves, five models, two jobs</h2>
    <p>Every model read every photo, then every model wrote recommendations from the best reading of each photo. The two stages are scored separately because the winner of one need not win the other.</p>
    <div class="two">
      <div>
        <h3>The shelves</h3>
        <div class="tablewrap"><table id="photos"></table></div>
        <p class="hint">Titles are hand labels a person can read at full resolution. Partial titles are fragments only a reader who knows the book could name; they count as neither found nor invented. Photos are not shown here; they may include private rooms.</p>
      </div>
      <div>
        <h3>The models</h3>
        <div class="tablewrap"><table id="models"></table></div>
        <p class="hint" id="settings"></p>
      </div>
    </div>
  </div>
</section>

<section id="extraction">
  <div class="spine"><span class="eyebrow">Stage 1 · Reading</span></div>
  <div class="body">
    <h2>Can it read the spines?</h2>
    <p>Recall is the share of labelled titles the model returned. Invented titles are returned titles that match no label; the proposal treats them as the worse failure, so they are never folded into a single accuracy number.</p>
    <div class="charts" id="excharts"></div>
    <div class="legend"><span class="emph"><i></i>the chosen pair's vision model</span><span class="ctx"><i></i>other</span><span class="fail"><i></i>fails a quality line</span><span class="tgt"><i></i>pass line</span></div>
    <h3>Every photo, every model</h3>
    <p class="hint">Found over labelled, with the count of invented titles. Select a cell to see exactly which titles were found, missed, invented, or matched a partial label.</p>
    <div class="tablewrap"><table class="matrix" id="exmatrix"></table></div>
    <div class="detail" id="exdetail"></div>
    <div class="chiplegend"><span class="chip found">found</span><span class="chip missed">missed</span><span class="chip invented">invented</span><span class="chip partial">partial label</span></div>
  </div>
</section>

<section id="recommendation">
  <div class="spine"><span class="eyebrow">Stage 2 · Choosing</span></div>
  <div class="body">
    <h2>Can it recommend well from the list?</h2>
    <p>Each language model received the same five inputs: the best extraction of each photo, plus Marina's preferences. A recommendation is valid if it names a title it was given; the second count says whether that title is also a real book on the shelf. Overlap is how many of the five match the books Marina herself would pick from that shelf.</p>
    <div class="charts" id="reccharts"></div>
    <div class="legend"><span class="emph"><i></i>the chosen pair's language model</span><span class="ctx"><i></i>other</span><span class="tgt"><i></i>pass line</span></div>
    <h3>The recommendations, side by side</h3>
    <p class="rubric">Picks that match Marina's own choice for the shelf are marked <b>✓ my pick</b>.</p>
    <div class="tabs" id="rectabs" role="tablist"></div>
    <p class="shelf" id="shelf"></p>
    <div class="reccols" id="reccols"></div>
  </div>
</section>

<section id="criteria">
  <div class="spine"><span class="eyebrow">Decision</span></div>
  <div class="body">
    <h2>Against the proposal's pass lines</h2>
    <div class="tablewrap"><table class="crit" id="crit"></table></div>
    <p class="hint" id="pairnote"></p>
  </div>
</section>

<p class="foot" id="foot"></p>
</div>

<script id="data" type="application/json">__DATA__</script>
<script>
(function () {
  const D = JSON.parse(document.getElementById('data').textContent);
  const C = D.criteria;
  const byName = Object.fromEntries(D.models.map(m => [m.slug, m]));
  const short = s => (byName[s] ? byName[s].alias : s);
  const nice = s => ({haiku: 'Claude Haiku 4.5', sonnet: 'Claude Sonnet 5', 'gpt-mini': 'GPT-5.4 mini', 'gemini-flash': 'Gemini 3.8 Flash', 'qwen-flash': 'Qwen 3.8 Flash'})[short(s)] || s;
  const usd = v => v == null ? '–' : '$' + v.toFixed(4);
  const sec = v => v == null ? '–' : (v / 1000).toFixed(1) + ' s';
  const pct = v => v == null ? '–' : (v * 100).toFixed(0) + '%';
  const f2 = v => v == null ? '–' : v.toFixed(2);
  const el = (tag, attrs, ...kids) => { const e = document.createElement(tag); for (const k in (attrs || {})) { if (k === 'class') e.className = attrs[k]; else if (k.startsWith('on')) e.addEventListener(k.slice(2), attrs[k]); else e.setAttribute(k, attrs[k]); } for (const c of kids.flat()) e.append(c instanceof Node ? c : document.createTextNode(String(c))); return e; };
  const photoById = Object.fromEntries(D.photos.map(p => [p.id, p]));

  // ---- Extraction stats and winners
  const EX = D.extraction.stats;
  const exPass = s => s.median_recall != null && s.median_recall >= C.recall && s.mean_invented <= C.invented_per_photo && s.errors === 0;
  const exPassers = EX.filter(exPass);
  const RE = D.recommendation.stats;
  const recPass = s => s.all_valid_vs_extraction && s.median_valid_vs_truth >= C.valid_vs_truth_median && s.errors === 0 && (s.median_overlap == null || s.median_overlap >= C.overlap_median);
  const recPassers = RE.filter(recPass);
  // The decision is a pair: cheapest pair of passing models whose summed p50 meets the latency line, else cheapest pair.
  const pairs = [];
  for (const a of exPassers) for (const b of recPassers) pairs.push({ex: a, rec: b, cost: a.mean_cost_usd + b.mean_cost_usd, secs: (a.p50_latency_ms + b.p50_latency_ms) / 1000});
  const inTime = pairs.filter(p => p.secs < C.p50_seconds);
  const pair = (inTime.length ? inTime : pairs).sort((a, b) => a.cost - b.cost)[0] || null;
  const exWin = pair ? pair.ex : null, recWin = pair ? pair.rec : null;
  const pairIsInTime = pair ? pair.secs < C.p50_seconds : false;
  const scoredAny = RE.some(s => s.median_overlap != null);

  // ---- Masthead
  const nLabels = D.photos.reduce((n, p) => n + p.titles.length, 0);
  document.getElementById('lede').textContent = `Five phone photos of bookshelves, ${nLabels} hand-labelled titles, five affordable models. Which one can read a shelf, and which one can choose from it?`;
  document.getElementById('meta').append(
    el('span', null, 'Generated ', el('b', null, D.generated)),
    el('span', null, 'Model calls ', el('b', {class: 'num'}, D.totals.extraction_calls + D.totals.recommendation_calls)),
    el('span', null, 'Total spend ', el('b', {class: 'num'}, usd(D.totals.spend_usd))),
    el('span', null, 'Prompts ', el('b', null, D.settings.extract_prompt + ', ' + D.settings.recommend_prompt)));

  // ---- Verdict cards
  const V = document.getElementById('verdict');
  const exLabel = s => `${nice(s.model)} @ ${s.edge}px`;
  V.append(el('div', {class: 'card'}, el('h3', null, 'Reading'),
    el('div', {class: 'pick'}, exWin ? exLabel(exWin) : 'No model passed'),
    el('p', null, exWin ? `Its half of the cheapest pair, of ${exPassers.length} models that met the reading lines, that also lands under ${C.p50_seconds} s: median recall ${f2(exWin.median_recall)}, ${f2(exWin.mean_invented)} invented per photo, ${usd(exWin.mean_cost_usd)} and ${sec(exWin.p50_latency_ms)} per photo.` : `Pass line is recall ≥ ${C.recall} with ≤ ${C.invented_per_photo} invented title per photo.`)));
  V.append(el('div', {class: 'card'}, el('h3', null, 'Choosing'),
    el('div', {class: 'pick'}, recWin ? nice(recWin.model) : 'No model passed'),
    el('p', null, recWin ? `Its half of that pair; ${recPassers.length} models met the validity lines. Runs at ${usd(recWin.mean_cost_usd)} and ${sec(recWin.p50_latency_ms)} per run. ${scoredAny ? `Median overlap with Marina's own picks ${recWin.median_overlap} of 5.` : 'Overlap with Marina\'s picks is not yet recorded.'}` : 'Validity lines: 5 of 5 on the list every run, median ≥ 4 of 5 real books.')));

  // ---- Photos table
  const PT = document.getElementById('photos');
  PT.append(el('tr', null, el('th', null, 'Photo'), el('th', {class: 'r'}, 'Titles'), el('th', {class: 'r'}, 'Partial'), el('th', null, 'Conditions')));
  for (const p of D.photos) PT.append(el('tr', null, el('td', {class: 'num'}, p.id), el('td', {class: 'r num'}, p.titles.length), el('td', {class: 'r num'}, p.partial.length), el('td', {class: 'notes'}, p.notes || '')));

  // ---- Models table
  const MT = document.getElementById('models');
  MT.append(el('tr', null, el('th', null, 'Model'), el('th', null, 'Slug'), el('th', {class: 'r'}, '$/M in'), el('th', {class: 'r'}, '$/M out'), el('th', null, 'Reasoning')));
  for (const m of D.models) MT.append(el('tr', null, el('td', null, nice(m.slug)), el('td', {class: 'mono', style: 'font-size:12px'}, m.slug), el('td', {class: 'r num'}, m.price_input.toFixed(2)), el('td', {class: 'r num'}, m.price_output.toFixed(2)), el('td', null, m.reasoning_effort || 'default')));
  document.getElementById('settings').textContent = `All calls through OpenRouter; the provider it routed to is logged per call. Images downscaled to a ${D.settings.default_max_edge}px long edge unless stated. Titles match a label at a normalised sequence ratio of ${D.settings.match_threshold} or above.`;

  // ---- Bar chart helper: horizontal bars, one hue, emphasis on the pick, direct labels, optional target line
  function barChart(title, items, opts) {
    const W = 360, rowH = 26, left = 128, right = 64, top = 6;
    const H = top + items.length * rowH + (opts.target != null ? 14 : 4);
    const max = Math.max(opts.max || 0, ...items.map(i => i.value || 0), opts.target || 0) || 1;
    const x = v => left + (v / max) * (W - left - right);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const S = (tag, attrs, text) => { const e = document.createElementNS('http://www.w3.org/2000/svg', tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (text != null) e.textContent = text; return e; };
    svg.append(S('line', {x1: left, x2: left, y1: top, y2: top + items.length * rowH, class: 'axis'}));
    items.forEach((it, i) => {
      const y = top + i * rowH;
      svg.append(S('text', {x: left - 8, y: y + rowH / 2 + 4, 'text-anchor': 'end', class: 'lbl'}, it.label));
      if (it.value == null) { svg.append(S('text', {x: left + 6, y: y + rowH / 2 + 4, class: 'tlabel'}, 'no data')); return; }
      const w = Math.max(2, x(it.value) - left);
      const r = S('rect', {x: left, y: y + 5, width: w, height: rowH - 10, rx: 0, class: 'bar' + (it.emph ? ' emph' : '') + (it.fail ? ' fail' : '')});
      r.append(S('title', {}, `${it.label}: ${it.text}`));
      svg.append(r);
      svg.append(S('text', {x: left + w + 6, y: y + rowH / 2 + 4, class: 'val'}, it.text));
    });
    if (opts.target != null) {
      const tx = x(opts.target);
      svg.append(S('line', {x1: tx, x2: tx, y1: top, y2: top + items.length * rowH + 2, class: 'target'}));
      svg.append(S('text', {x: tx, y: H - 1, 'text-anchor': 'middle', class: 'tlabel'}, opts.targetText));
    }
    return el('div', {class: 'chart'}, el('h3', null, title), svg);
  }

  // ---- Extraction charts
  const XC = document.getElementById('excharts');
  const exItems = f => EX.map(s => Object.assign({label: `${short(s.model)}${s.edge !== D.settings.default_max_edge ? ' @' + s.edge : ''}`, emph: exWin && s === exWin, fail: !exPass(s)}, f(s)));
  XC.append(barChart('Median recall', exItems(s => ({value: s.median_recall, text: f2(s.median_recall)})), {max: 1, target: C.recall, targetText: '≥ ' + C.recall}));
  XC.append(barChart('Invented titles per photo', exItems(s => ({value: s.mean_invented, text: f2(s.mean_invented)})), {target: C.invented_per_photo, targetText: '≤ ' + C.invented_per_photo}));
  XC.append(barChart('Cost per photo', exItems(s => ({value: s.mean_cost_usd, text: usd(s.mean_cost_usd)})), {}));
  XC.append(barChart('Latency, p50', exItems(s => ({value: s.p50_latency_ms / 1000, text: sec(s.p50_latency_ms)})), {}));

  // ---- Extraction matrix
  const XM = document.getElementById('exmatrix');
  const cols = EX.map(s => ({model: s.model, edge: s.edge}));
  const rowFor = (pid, c) => D.extraction.rows.find(r => r.photo_id === pid && r.model === c.model && r.edge === c.edge);
  XM.append(el('tr', null, el('th', null, 'Photo'), ...cols.map(c => el('th', null, short(c.model) + (c.edge !== D.settings.default_max_edge ? ' @' + c.edge : '')))));
  const XD = document.getElementById('exdetail');
  let activeCell = null;
  function showDetail(r, td) {
    if (activeCell) activeCell.classList.remove('active');
    activeCell = td; td.classList.add('active');
    XD.replaceChildren(
      el('h3', null, `Photo ${r.photo_id} · ${nice(r.model)} @ ${r.edge}px · ${r.found.length}/${r.found.length + r.missed.length} found, ${r.invented.length} invented · ${usd(r.cost_usd)} · ${sec(r.latency_ms)} · routed to ${r.provider || '?'}`),
      el('div', {class: 'chips'}, r.found.map(t => el('span', {class: 'chip found'}, t)), r.missed.map(t => el('span', {class: 'chip missed'}, t)), r.invented.map(t => el('span', {class: 'chip invented'}, t)), r.partial.map(t => el('span', {class: 'chip partial'}, t))),
      el('p', {class: 'hint', style: 'margin:0'}, 'Returned as written: ', r.extracted.join(' · ')));
    XD.scrollIntoView({block: 'nearest'});
  }
  for (const p of D.photos) {
    const tr = el('tr', null, el('td', {class: 'num'}, p.id, el('span', {class: 'sub'}, `${p.titles.length} titles`)));
    for (const c of cols) {
      const r = rowFor(p.id, c);
      if (!r) { tr.append(el('td', {class: 'cell', style: 'color:var(--ink-3)'}, 'error')); continue; }
      const td = el('td', {class: 'cell num', tabindex: '0', role: 'button', 'aria-label': `Photo ${p.id}, ${nice(c.model)}: details`},
        el('span', {class: 'frac'}, `${r.found.length}/${r.found.length + r.missed.length}`),
        el('span', {class: 'inv' + (r.invented.length ? '' : ' zero')}, r.invented.length ? `+${r.invented.length} inv` : '0 inv'),
        el('span', {class: 'sub'}, `${sec(r.latency_ms)} · ${usd(r.cost_usd)}`));
      td.addEventListener('click', () => showDetail(r, td));
      td.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showDetail(r, td); } });
      tr.append(td);
    }
    XM.append(tr);
  }

  // ---- Recommendation charts
  const RC = document.getElementById('reccharts');
  const recItems = f => RE.map(s => Object.assign({label: short(s.model), emph: recWin && s === recWin, fail: !recPass(s)}, f(s)));
  RC.append(barChart('Real books among picks', recItems(s => ({value: s.share_valid_vs_truth, text: pct(s.share_valid_vs_truth)})), {max: 1, target: C.valid_vs_truth_median / 5, targetText: 'median ≥ 4 of 5'}));
  RC.append(barChart("Overlap with Marina's picks, mean of 5", recItems(s => ({value: s.mean_overlap, text: s.mean_overlap == null ? 'no picks yet' : `${f2(s.mean_overlap)} (median ${s.median_overlap})`})), {max: 5, target: C.overlap_median, targetText: 'median ≥ ' + C.overlap_median}));
  RC.append(barChart('Cost per run', recItems(s => ({value: s.mean_cost_usd, text: usd(s.mean_cost_usd)})), {}));
  RC.append(barChart('Latency, p50', recItems(s => ({value: s.p50_latency_ms / 1000, text: sec(s.p50_latency_ms)})), {}));

  // ---- Recommendation tabs per photo, model columns, scoring
  const tabs = document.getElementById('rectabs'), RCOLS = document.getElementById('reccols'), SH = document.getElementById('shelf');
  function showPhoto(pid) {
    for (const b of tabs.children) b.setAttribute('aria-selected', String(+b.dataset.pid === pid));
    const best = Object.entries(D.best_extraction).find(([, m]) => m.photo_id === pid);
    const bestId = best ? +best[0] : null;
    const exRow = D.extraction.rows.find(r => r.id === bestId);
    const myPicks = photoById[pid].picks || [];
    SH.replaceChildren(`Input: extraction ${bestId} by ${best ? nice(best[1].model) : '?'} (${best ? best[1].found : '?'} titles found, ${best ? best[1].invented : '?'} invented). `, exRow ? el('span', null, 'Shelf list: ' + exRow.extracted.join(' · ')) : '', myPicks.length ? el('span', null, el('br'), photoById[pid].picks_all ? "Marina's picks: every book on this shelf, so overlap here is always 5 of 5." : "Marina's picks: " + myPicks.join(' · ')) : '');
    RCOLS.replaceChildren();
    for (const r of D.recommendation.rows.filter(r => r.photo_id === pid)) {
      const col = el('div', {class: 'reccol'}, el('header', null, el('h3', null, nice(r.model)), el('span', {class: 'stat'}, `${r.overlap != null ? r.overlap + '/5 my picks · ' : ''}${r.valid_vs_ground_truth}/${r.recs.length} real · ${usd(r.cost_usd)} · ${sec(r.latency_ms)}`)));
      const labels = photoById[pid].titles;
      r.recs.forEach((rec, i) => {
        const onList = exRow ? exRow.extracted.some(t => norm(t) === norm(rec.title) || norm(t).includes(norm(rec.title)) || norm(rec.title).includes(norm(t))) : true;
        const real = labels.some(t => norm(t) === norm(rec.title) || norm(t).includes(norm(rec.title)) || norm(rec.title).includes(norm(t)));
        const mine = myPicks.some(t => norm(t) === norm(rec.title) || norm(t).includes(norm(rec.title)) || norm(rec.title).includes(norm(t)));
        const t = el('div', {class: 't' + (onList ? '' : ' off')}, `${i + 1}. ${rec.title}`, mine ? el('span', {class: 'tag mine'}, '✓ my pick') : '', onList && !real ? el('span', {class: 'tag'}, 'not a real book here') : '', onList ? '' : el('span', {class: 'tag'}, 'not on the list'));
        col.append(el('div', {class: 'pick'}, t, el('div', {class: 'why'}, rec.reason)));
      });
      RCOLS.append(col);
    }
  }
  function norm(s) { return (s || '').toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim(); }
  for (const p of D.photos) { const b = el('button', {class: 'tab', role: 'tab', 'data-pid': p.id, 'aria-selected': 'false'}, `Photo ${p.id}`); b.addEventListener('click', () => showPhoto(p.id)); tabs.append(b); }
  if (D.photos.length) showPhoto(D.photos[0].id);

  // ---- Criteria table
  const CT = document.getElementById('crit');
  CT.append(el('tr', null, el('th', null, 'Question'), el('th', null, 'Pass line'), el('th', null, 'Best candidate'), el('th', null, 'Result'), el('th', null, 'Verdict')));
  const row = (q, line, who, result, verdict) => CT.append(el('tr', null, el('td', null, q), el('td', null, line), el('td', null, who), el('td', {class: 'num'}, result), el('td', {class: verdict.toLowerCase()}, verdict)));
  const bestEx = EX.filter(s => s.errors === 0).sort((a, b) => (b.median_recall - a.median_recall) || (a.mean_invented - b.mean_invented) || (a.mean_cost_usd - b.mean_cost_usd))[0];
  row('Vision reads spines', `median recall ≥ ${C.recall}, invented ≤ ${C.invented_per_photo}/photo`, bestEx ? exLabel(bestEx) : '–', bestEx ? `${f2(bestEx.median_recall)} recall, ${f2(bestEx.mean_invented)} invented` : '–', bestEx && exPass(bestEx) ? 'Pass' : 'Fail');
  const bestRec = RE.filter(s => s.errors === 0).sort((a, b) => (b.share_valid_vs_truth - a.share_valid_vs_truth) || (a.mean_cost_usd - b.mean_cost_usd))[0];
  row('Recommendations are valid', '5 of 5 on the list every run; median ≥ 4 of 5 real', bestRec ? nice(bestRec.model) : '–', bestRec ? `${bestRec.all_valid_vs_extraction ? 'all on list' : 'off-list picks'}, median ${bestRec.median_valid_vs_truth} of 5 real` : '–', bestRec && recPass(bestRec) ? 'Pass' : 'Fail');
  const bestOv = RE.filter(s => s.median_overlap != null).sort((a, b) => (b.median_overlap - a.median_overlap) || (b.mean_overlap - a.mean_overlap))[0];
  row("Recommendations match Marina's picks", `median overlap ≥ ${C.overlap_median} of 5`, bestOv ? nice(bestOv.model) : 'no picks yet', bestOv ? `median ${bestOv.median_overlap}, mean ${f2(bestOv.mean_overlap)} over ${bestOv.overlap_runs} photos` : '–', bestOv ? (bestOv.median_overlap >= C.overlap_median ? 'Pass' : 'Fail') : 'Pending');
  const pairCost = exWin && recWin ? exWin.mean_cost_usd + recWin.mean_cost_usd : null;
  const pairTime = exWin && recWin ? (exWin.p50_latency_ms + recWin.p50_latency_ms) / 1000 : null;
  const pairName = exWin && recWin ? `${nice(exWin.model)} + ${nice(recWin.model)}` : '–';
  row('Affordable', `best pair < $${C.cost_per_scan.toFixed(2)} per scan`, pairName, pairCost != null ? usd(pairCost) : '–', pairCost == null ? 'Pending' : pairCost < C.cost_per_scan ? 'Pass' : 'Fail');
  row('Fast enough', `p50 under ${C.p50_seconds} s for both stages`, pairName, pairTime != null ? pairTime.toFixed(1) + ' s' : '–', pairTime == null ? 'Pending' : pairTime < C.p50_seconds ? 'Pass' : 'Fail');
  const cheapest = pairs.slice().sort((a, b) => a.cost - b.cost)[0];
  document.getElementById('pairnote').textContent = pair ? `${pairs.length} pairs of passing models were possible; ${inTime.length} land under ${C.p50_seconds} s. This is the cheapest of those${pairIsInTime ? '' : ' (none did, so it is the cheapest overall)'}.${cheapest && cheapest !== pair ? ` The cheapest pair overall, ${nice(cheapest.ex.model)} + ${nice(cheapest.rec.model)} at ${usd(cheapest.cost)}, sums to ${cheapest.secs.toFixed(1)} s.` : ''} Latency is the sum of two p50s and an upper bound: every call went through OpenRouter, one extra hop.` : 'No pair of passing models yet.';
  document.getElementById('foot').textContent = `Generated from the extractions and recommendations tables on ${D.generated}. Regenerate with: uv run shelfscanner report --html docs/changes/archive/001-mvp/report.html`;
})();
</script>
"""
