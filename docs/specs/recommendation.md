# Recommendation

A language model picks five books from an extraction, given a preferences
file. Every pick is checked and the run is logged.

## Commands

`uv run shelfscanner recommend --extraction <id> [--model <alias|slug>] --prefs <file|session id> [--prompt name]`

`uv run shelfscanner run --photo <id|all> [--vision-model <m>] [--llm-model <m>] --prefs <file|session id> [--max-dim N] [--extract-prompt name] [--recommend-prompt name] [--no-verify]`

A model flag unset means the stage's primary from config, with failover
(see `model-router.md`). `--prefs` is a JSON file or a session id whose
preferences row is read (see `preferences.md`).

`run` extracts, then recommends from that extraction, and prints both. If
the extraction failed the recommendation is skipped.

## Input to the model

- The prompt file `prompts/<name>.md` (default `recommend_v5`: v3 plus one
  line saying a shelf book by a favorite author is a strong pick; v4, the
  same line with "and so is a book that resembles their work", put a book
  that was not on the shelf into two of fifteen core runs and is kept only
  as a comparison row, 012), which asks
  for exactly five ranked picks from the list, exact title strings, and a
  one-to-three-sentence reason tying a stated preference to something
  specific about the book. v1 and v2 put the shelf list first and the
  preferences after it; v3 and later put the preferences first and the
  shelf last, headed "the only books you may recommend" (change 004, task
  4: with a Goodreads-sized preferences block after the shelf, GPT-5.4
  mini recommended books that were not on the shelf on three of five
  core photos; with the shelf last it did not).
- The extraction's books as a list, with the author where the extraction
  supplied one. Invented titles are included: the model sees what the
  vision stage produced.
- **With a verified list (change 007).** `recommend_from_extraction` takes
  an optional `verified` (`verify.Verified`, see `book-lookup.md`). When
  given, the list above is replaced by the kept titles under their
  catalogue title and author; dropped titles are not shown to the model,
  and a title whose lookup failed appears as read. The hard validity check
  runs against that list, so a pick that names a dropped title is off the
  list. Each pick stored in `parsed_recommendations` gains `verified`
  (true when it matches a kept title whose record was found; false for an
  unverified or off-list pick), `catalogue_id` and `cover_id` (from the
  record, or null). `run` passes the verified list unless `--no-verify`;
  `recommend` on its own, and `research.matrix llm` without `--verify`,
  pass none, and then nothing here changes.
- The preferences, laid out as text: the flat shape as JSON for
  `recommend_v1`, the structured object as labelled lists otherwise (see
  `preferences.md`). A top-level `_note` key is removed first.

`data/prefs/marina.json` holds `genres`, `likes`, `loved_books`, `avoid`.

## Checks

For each pick, using the same matcher as extraction:

- valid against the extraction: matches a title the model was given. This
  is the hard constraint.
- valid against ground truth: also matches one of the photo's labelled
  titles. Partial labels do not count.

A reply with the wrong number of picks (five, or every book if the list is
shorter) is logged with `error` set.

## Overlap with the user's picks

`data/prefs/marina_picks.json` lists, per photo id, the books Marina would
choose from that shelf. A pick given as a list is satisfied by any of its
titles. When the visual report is built, each recommendation run gets an
overlap count, 0 to 5: the number of her picks that one of the run's titles
matches, using the same matcher. Nothing is stored in the database for this;
it is recomputed from the file each time.

## Specificity (unused)

`uv run shelfscanner score --recommendation <id> --specificity 1 2 3 2 3`

One score per pick, in order, each 1 (generic), 2 (references a stated
preference) or 3 (references a preference and something specific about the
book). The count must match the row and the values are range-checked both
in the command and by a database constraint. Rerunning overwrites. The
column and command exist but the spike's quality measure is overlap.

## Logged row

`recommendations`: `extraction_id`, `provider`, `adapter`, `request_id`, `model` (the model that answered), `failover_from`, `failover_error`, `prompt_version`,
`preferences` (as sent), `raw_output`, `parsed_recommendations`,
`valid_vs_extraction`, `valid_vs_ground_truth`, `specificity_scores`,
`latency_ms`, `input_tokens`, `output_tokens`, `cost_usd`, `error`,
`created_at`.
