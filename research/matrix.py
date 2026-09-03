"""Matrix drivers for a model comparison, run in parallel by model.

    uv run python -m research.matrix vision haiku,sonnet [--max-dim 2400]
    uv run python -m research.matrix llm gpt-mini,qwen-flash [--prefs data/prefs/marina.json]

`vision` runs each named model over every synced photo. `llm` runs each named
model over the best extraction of each photo (highest recall, fewest
invented, earliest). Every call is logged by the pipeline as usual; this
only decides what to run.
"""

from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from shelfscanner import extract, recommend, storage
from shelfscanner.config import load_config
from shelfscanner.db import get_client
from shelfscanner.settings import DATA_DIR


def best_extractions() -> list[dict]:
    rows = get_client().table("extractions").select("*").is_("error", "null").execute().data
    best: dict[int, tuple] = {}
    for r in rows:
        total = r["found_count"] + r["missed_count"]
        recall = r["found_count"] / total if total else 0
        key = (-recall, r["invented_count"], r["id"])
        if r["photo_id"] not in best or key < best[r["photo_id"]][0]:
            best[r["photo_id"]] = (key, r)
    return [v[1] for _, v in sorted(best.items())]


def run_vision(aliases: list[str], max_dim: int | None) -> None:
    cfg = load_config()
    edge = max_dim or cfg.default_max_edge
    photos = storage.list_photos()

    def one(alias: str) -> list:
        m = cfg.model(alias)
        out = []
        for p in photos:
            r = extract.extract_photo(p, m, edge, extract.DEFAULT_PROMPT)
            print(r.line(), flush=True)
            out.append(r)
        return out

    with ThreadPoolExecutor(max_workers=len(aliases)) as pool:
        results = [r for rows in pool.map(one, aliases) for r in rows]
    ok = [r for r in results if not r.error]
    print(f"\n{len(ok)}/{len(results)} ok, total cost ${sum(r.cost_usd or 0 for r in ok):.4f}")


def run_llm(aliases: list[str], prefs_path: Path) -> None:
    cfg = load_config()
    prefs = recommend.load_prefs(prefs_path)
    inputs = best_extractions()
    for r in inputs:
        print(f"photo {r['photo_id']}: best extraction {r['id']} ({r['model']} @{r['image_long_edge']}, "
              f"found {r['found_count']}, invented {r['invented_count']})")

    def one(alias: str) -> list:
        m = cfg.model(alias)
        out = []
        for ex in inputs:
            row = recommend.recommend_from_extraction(ex, m, prefs, recommend.DEFAULT_PROMPT)
            print(row.lines()[0], flush=True)
            out.append(row)
        return out

    with ThreadPoolExecutor(max_workers=len(aliases)) as pool:
        results = [r for rows in pool.map(one, aliases) for r in rows]
    ok = [r for r in results if not r.error]
    print(f"\n{len(ok)}/{len(results)} ok, total cost ${sum(r.cost_usd or 0 for r in results):.4f}")


def main() -> None:
    ap = argparse.ArgumentParser(prog="research.matrix")
    sub = ap.add_subparsers(dest="stage", required=True)
    v = sub.add_parser("vision", help="every named model over every photo")
    v.add_argument("models", help="comma-separated aliases from config/models.toml")
    v.add_argument("--max-dim", type=int, default=None)
    t = sub.add_parser("llm", help="every named model over the best extraction of each photo")
    t.add_argument("models")
    t.add_argument("--prefs", type=Path, default=DATA_DIR / "prefs" / "marina.json")
    args = ap.parse_args()
    aliases = args.models.split(",")
    if args.stage == "vision":
        run_vision(aliases, args.max_dim)
    else:
        run_llm(aliases, args.prefs)


if __name__ == "__main__":
    main()
