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

## Still to do

1. The full grid on the choosing primary and its fallback: v1 and v2,
   flat and export. Pass line: median overlap at least 4 on photos 1 to 4
   with v2 plus the export.
2. Set the default prompt in config; update the baseline; archive.
