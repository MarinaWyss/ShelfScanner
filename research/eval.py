"""The eval in one command (change 011, task 2).

    uv run python -m research.eval [--set core] [--reading-set all] [--check-set core]
                                   [--reading alias] [--choosing alias] [--prompt name] [--prefs file]

Runs the reading primary over the photos of `--reading-set` (default: `--set`) and the choosing
primary over the best extraction of each photo in `--set`, both through `research.matrix` so every
call is logged as usual, then `research.check --set <check-set>` (default: `--set`) against the
committed baseline. The check's verdict is the last thing printed and the exit code: 0 when nothing
regressed, 1 otherwise. The nightly workflow is this command.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from research import check, matrix
from shelfscanner import recommend
from shelfscanner.config import load_config
from shelfscanner.settings import DATA_DIR


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="research.eval", description="run the primaries over a set, then the regression check")
    ap.add_argument("--set", default="core", help="photo set for the choosing stage and, unless overridden, the rest")
    ap.add_argument("--reading-set", default=None, help="photo set for the reading stage (default: --set)")
    ap.add_argument("--check-set", default=None, help="baseline entry to compare to (default: --set)")
    ap.add_argument("--reading", default=None, help="model alias for reading (default: the stage's primary)")
    ap.add_argument("--choosing", default=None, help="model alias for choosing (default: the stage's primary)")
    ap.add_argument("--prompt", default=recommend.DEFAULT_PROMPT, help="recommendation prompt name")
    ap.add_argument("--prefs", type=Path, default=DATA_DIR / "prefs" / "marina.json")
    ap.add_argument("--max-dim", type=int, default=None)
    args = ap.parse_args(argv)

    cfg = load_config()
    reading = args.reading or cfg.stage("reading").primary
    choosing = args.choosing or cfg.stage("choosing").primary
    reading_set = args.reading_set or args.set
    check_set = args.check_set or args.set

    print(f"== reading: {reading} over set {reading_set}")
    matrix.run_vision([reading], args.max_dim, reading_set)
    print(f"\n== choosing: {choosing} over the best extraction per photo in set {args.set}, prompt {args.prompt}")
    matrix.run_llm([choosing], args.prefs, args.prompt, args.set)
    print(f"\n== check: set {check_set} against research/baseline.json")
    return check.main(["--set", check_set])


if __name__ == "__main__":
    raise SystemExit(main())
