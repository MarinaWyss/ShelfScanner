"""`shelfscanner` command-line entry point. Subcommands are added task by task."""

from __future__ import annotations

import argparse

from shelfscanner import extract, photos_fetch, preferences, recommend, retention, storage
from shelfscanner.config import load_config


def _photos_sync(_: argparse.Namespace) -> None:
    for line in storage.sync_photos():
        print(line)


def _photos_list(_: argparse.Namespace) -> None:
    rows = storage.list_photos()
    if not rows:
        print("No photos synced yet.")
        return
    for r in rows:
        print(f"{r['id']:>3}  {r['storage_path']:<32} titles={len(r['titles']):<3} partial={len(r['partial_titles'])}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="shelfscanner")
    sub = parser.add_subparsers(dest="command", required=True)
    preferences.add_parser(sub)

    photos = sub.add_parser("photos", help="manage the test-set photos in Supabase")
    photos_sub = photos.add_subparsers(dest="photos_command", required=True)
    photos_sub.add_parser("sync", help="strip EXIF, upload photos, upsert label rows").set_defaults(func=_photos_sync)
    photos_sub.add_parser("list", help="list photo rows").set_defaults(func=_photos_list)
    retention.add_parser(photos_sub)
    photos_fetch.add_parser(photos_sub)

    ex = sub.add_parser("extract", help="run a vision model over a photo and log the scored extraction")
    ex.add_argument("--photo", required=True, help="photo id, or 'all'")
    ex.add_argument("--model", default=None, help="model alias or slug (default: the reading stage's primary, with failover)")
    ex.add_argument("--max-dim", type=int, default=None, help="long edge in px (default from config)")
    ex.add_argument("--prompt", default=extract.DEFAULT_PROMPT, help="prompt name under prompts/ (default extract_v1)")
    ex.set_defaults(func=_extract)

    rec = sub.add_parser("recommend", help="run a language model over an extraction and log the checked recommendations")
    rec.add_argument("--extraction", required=True, type=int, help="extraction id")
    rec.add_argument("--model", default=None, help="model alias or slug (default: the choosing stage's primary, with failover)")
    rec.add_argument("--prefs", required=True, help="preferences JSON file, or a session id (change 004)")
    rec.add_argument("--prompt", default=recommend.DEFAULT_PROMPT, help="prompt name under prompts/ (default recommend_v1)")
    rec.set_defaults(func=_recommend)

    run = sub.add_parser("run", help="extract then recommend for a photo")
    run.add_argument("--photo", required=True, help="photo id, or 'all'")
    run.add_argument("--vision-model", default=None, help="model for extraction (default: reading primary)")
    run.add_argument("--llm-model", default=None, help="model for recommendation (default: choosing primary)")
    run.add_argument("--prefs", required=True, help="preferences JSON file, or a session id")
    run.add_argument("--max-dim", type=int, default=None)
    run.add_argument("--extract-prompt", default=extract.DEFAULT_PROMPT)
    run.add_argument("--recommend-prompt", default=recommend.DEFAULT_PROMPT)
    run.add_argument("--no-verify", action="store_true",
                     help="skip the catalogue check between extraction and recommendation (change 007)")
    run.set_defaults(func=_run)

    sc = sub.add_parser("score", help="enter hand specificity scores (1-3) for a recommendation row")
    sc.add_argument("--recommendation", required=True, type=int, help="recommendation id")
    sc.add_argument("--specificity", required=True, type=int, nargs="+", help="one score per title, in order, e.g. 1 2 3 2 3")
    sc.set_defaults(func=_score)

    return parser


def _score(args: argparse.Namespace) -> None:
    row = recommend.set_specificity(args.recommendation, args.specificity)
    print(f"recommendation {row['id']}: specificity {row['specificity_scores']} (mean {sum(row['specificity_scores']) / len(row['specificity_scores']):.2f})")


def _recommend(args: argparse.Namespace) -> None:
    for line in recommend.run_recommend(args.extraction, args.model, args.prefs, args.prompt).lines():
        print(line)


def _run(args: argparse.Namespace) -> None:
    from shelfscanner import verify  # change 007; local so the shared import block above stays untouched

    prefs = preferences.load(args.prefs)
    llm = load_config().model(args.llm_model) if args.llm_model else None
    for ex_row in extract.run_extract(args.photo, args.vision_model, args.max_dim, args.extract_prompt):
        print(ex_row.line())
        if ex_row.error:
            print("  skipping recommendation: extraction failed")
            continue
        ex = extract.get_extraction(ex_row.id)
        # --- change 007 --- the catalogue check sits between the two model calls unless --no-verify
        ver = None
        if not args.no_verify:
            ver = verify.verify_extraction(ex)
            for line in ver.lines():
                print(line)
        # --- end change 007 ---
        rec_row = recommend.recommend_from_extraction(ex, llm, prefs, args.recommend_prompt, verified=ver)
        for line in rec_row.lines():
            print(line)


def _extract(args: argparse.Namespace) -> None:
    rows = extract.run_extract(args.photo, args.model, args.max_dim, args.prompt)
    for r in rows:
        print(r.line())
    ok = [r for r in rows if not r.error]
    if len(rows) > 1 and ok:
        recall = sorted(r.found / (r.found + r.missed) for r in ok if r.found + r.missed)
        med = recall[len(recall) // 2]
        print(f"{len(ok)}/{len(rows)} ok  median recall {med:.2f}  invented total {sum(r.invented for r in ok)}  "
              f"cost ${sum(r.cost_usd or 0 for r in ok):.4f}")


def main() -> None:
    args = build_parser().parse_args()
    args.func(args)
