# 004 — Results (in progress)

Date: 2026-09-03. Importer, preferences table and `recommend_v2.md` are on
main (tasks 1 to 3). Task 4, the eval on the choosing primary, waits for
`OPENAI_API_KEY`; the early signal below is on Claude Sonnet 5 direct,
the only direct adapter with a key on this machine.

## The import

Marina's export: 454 rows, 257 read, 188 to-read, 236 rated. With the D2
cap and her flat file as base: 60 rated books (the 7 dislikes plus the 53
most recent fives), 20 to-read, 7 avoid entries, 4 genres. About 2k
tokens of preferences text in the prompt.

## Early signal: v1 flat file versus v2 with the export, Sonnet 5

Same five best extractions as change 001. Overlap is how many of the
run's five picks match Marina's own picks for that shelf; photo 5 is
excluded from the summary because every book on it is approved.

| Photo | v1, flat file, via OpenRouter (change 001) | v2, flat file, direct | v2, Goodreads object, direct |
|---|---|---|---|
| 1 | 2 | 3 | 4 |
| 2 | 1 | 2 | 2 |
| 3 | 2 | 2 | 3 |
| 4 | 4 | 3 | 4 |
| mean, photos 1 to 4 | 2.25 | 2.50 | 3.25 |
| median, all five | 2 | 3 | 4 |

The middle column answers the "nothing lost" question: v2 with the old
flat file is no worse than v1 (slightly better on the mean), so a user
with no export gets at least what change 001 measured. The right column
is the export's contribution on top of the prompt: most of the gain.

Sonnet was the weakest chooser in change 001 (fail on overlap). With the
richer input it passes the same line (median at least 3) without any
change to the model. Photo 2, the shelf where every model missed the
history titles because the flat file never mentioned history, moved from
1 to 2; the export contains rated history books, so the model had the
signal it lacked.

Cost and latency on this run are not the numbers that matter: Sonnet at
its default adaptive thinking took 22 to 29 s and $0.03 a run, with the
longer prompt. The choosing primary is a small fast model; its numbers
come with the key. What this run shows is the effect of the input, which
is what the proposal set out to measure.

## The grid on the choosing primary, GPT-5.4 mini direct

2026-09-03, with the OpenAI key; the same five best extractions;
`research.matrix llm gpt-mini --set core`. Overlap per photo as above.
Spend for the whole grid, both models: $0.11.

| Photo | v1, flat | v2, flat | v2, export | v3, export | v3, flat |
|---|---|---|---|---|---|
| 1 | 3 | 3 | **0 of 5 on the shelf** | 4 | 4 |
| 2 | 1 | 2 | **0 of 5 on the shelf** | 3 | 2 |
| 3 | 2 | 2 | 3 | 2 | 2 |
| 4 | 4 | 4 | **2 of 5 on the shelf** | 4 | 4 |
| 5 | 5 | 5 | 5 | 5 | 5 |
| mean, photos 1 to 4 | 2.50 | 2.75 | invalid | 3.25 | 3.00 |
| median, photos 1 to 4 | 2.5 | 2.5 | invalid | 3.5 | 3 |
| p50 latency | 4.1 s | 2.7 s | 2.9 s | 3.0 s | 2.4 s |
| cost per run | $0.0020 | $0.0021 | $0.0037 | $0.0036 | $0.0021 |

**The finding that changed the prompt.** v2 with the export broke R1 on
GPT-5.4 mini: on photos 1, 2 and 4 it named books that were on neither
the shelf nor the export ("Deep Utopia", "The Storm Before the Storm",
"Red Mars"). The R1 check caught every one (the rows carry the error, the
page would show the choosing stage failed), so nothing wrong reached a
user, but three failed scans in five is not a default. Sonnet 5 had been
fine on the same input (the table above); the small model loses the
shelf-only rule once a long preferences block separates the shelf from
the reply. `recommend_v3` puts the preferences first and the shelf last
and restates the rule; every pick is then on the shelf, and the overlap
is the best in the grid.

**The fallback, Haiku 4.5 direct, on v3:** export 4, 2, 2, 3 and one
count error on photo 5 (six picks); flat 4, 1, 4, 5 and one count error
on photo 2 (no picks). About 4.5 s and $0.005 a run with the export.
Valid picks were always on the shelf.

**Decision.** `recommend_v3` is the default for the CLI, the matrix and
the web scan. The pass line (median 4 on photos 1 to 4 with the export)
is not met: 3.5. It is recorded as not met and kept as the target; the
alternative, staying on v1 at 2.5, is worse on every cell. The baseline
was left at 4 on the day, then corrected: with three v3 runs per shelf on
file, the measured median is 3.33 (per shelf 3.33, 2.67, 1.67, 4.33, 5.00),
and change 001's 4 was one run of v1. `research/baseline.json` now says
3.33 with the reason; `research.check` passes on it (p50 2.5 to 3.2 s,
$0.0021).

## Gates

| Question | Pass |
|---|---|
| Import works | `tests/test_preferences.py`; Marina's export: 60 rated, 20 to-read, 7 avoid |
| Nothing lost | v2 and v3 with the flat file are no worse than v1 on every photo |
| The export helps | v3 with the export: mean 3.25 on photos 1 to 4 against 2.50 flat and 2.25 in change 001; **the median-4 line is not met** (3.5) |
| Nothing regressed | `research.check` PASS on the core set with the new default |

Archived 2026-09-03.
