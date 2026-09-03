# 004 — Preferences: Goodreads export, prompt v2, overlap eval

Status: approved 2026-09-02
Date: 2026-09-02
Deadline: 2026-09-16
Spend cap: $10
Track: quality (parallel with 003)

## Why

Change 001's clearest finding: the preferences file, not the model, limited
recommendation quality. On one shelf every model missed the user's history
picks because the file never mentioned history. The scoping doc's input
was always genres plus an optional Goodreads export; this change builds
that input and measures what it buys, on the CLI, before it goes on screen
in 005.

## What changes

- A Goodreads CSV importer: title, author, rating, shelf (read, to-read),
  date read. Output is a preferences object with `genres`, `free_text`,
  `rated_books` (title, author, rating), `to_read`, `avoid`. The raw CSV
  is not stored (R4).
- `prompts/recommend_v2.md` that takes the structured object and is told
  what ratings mean. The prompt is bounded: at most N rated books, the
  most recent and the highest rated first, so a long history fits.
- A preferences table keyed by session, written by the importer and read
  by the recommendation step. The CLI takes `--prefs` as a file or a
  session id.
- The overlap eval rerun on the five photos with Marina's real export,
  v1 versus v2, on the primary and fallback choosing models.

### Out of scope

- The genre-picking UI and the upload form (005).
- Any other import source. StoryGraph exports differently; later if asked.

## Decisions

**D1. Ratings are the signal, shelves are the filter.** Books rated 4 or 5
tell the model what the user likes; 1 or 2 what to avoid; `to-read`
tells it what the user already wants, which on a shelf is a strong pick.

**D2. The prompt gets a budget, not the whole history.** A cap of 60 rated
books and 20 to-read titles, chosen by recency and rating. If the eval
shows more helps, raise it; this is where retrieval would enter and the
scoping doc says to measure first.

**D3. v1 stays.** Prompt versions are files and both are logged; the eval
decides the default in config.

## How we know it worked

| Question | Pass |
|---|---|
| Import is right | Unit tests over a fixture export: counts, ratings, shelves, a title with a comma |
| Better picks | Median overlap on photos 1 to 4 with v2 plus the export at least 4 of 5, against 3 in change 001 |
| Nothing lost | v2 with the old flat file scores no worse than v1 |
| Still fast and cheap | Choosing stage p50 under 5 s and under a cent per run |

## Risks

- **Overlap is one person's taste on five shelves.** Accepted; 006 widens
  the set. A gain here is "keep going", not "proven".
- **A long history bloats the prompt.** D2's cap, with tokens logged so
  the cost of raising it is visible.

## Decided during the work

Task 4, the eval on the choosing primary (lead, 2026-09-03):

- **A third prompt, `recommend_v3`, and the shelf list last.** On GPT-5.4
  mini, v2 with the Goodreads object put picks that were not on the shelf
  on three of five core photos (0, 0 and 2 of 5 valid); the flat file was
  fine every time. The titles were not from the export either: the model
  drifted to books it would recommend in general once a 7,000-character
  preferences block sat between the shelf and the reply. v3 is v2 with
  the preferences first, the shelf last under the heading "the only books
  you may recommend", and the rule restated before the reply. On v3 every
  pick was on the shelf, with and without the export. The input order is
  a property of the prompt name (`recommend.input_text`): v1 and v2 keep
  their old order so their rows stay comparable.
- **The pass line was not met and the default changed anyway.** The line
  was median overlap of at least 4 on photos 1 to 4 with the export; v3
  with the export gives 4, 3, 2, 4 (median 3.5, mean 3.25). It is the best
  cell in the grid and better than change 001's 2.25, so it becomes the
  default; the line stays as the target for the next prompt.
- **The fallback's count errors are left alone.** Haiku 4.5 on v3 returned
  six picks once and none once over ten runs; R2 catches both and the
  page shows the stage failed. Not fixed in this change.

Taken by the worker on tasks 1 to 3 (2026-09-03) where the proposal was
silent. Each is behaviour in `docs/specs/preferences.md`; this records why.

- **Low ratings stay in `rated_books`.** The contract gives `rated_books`
  a 1 to 5 range and `avoid` free text, so 1s and 2s are not moved to
  `avoid`; the prompt explains what a low rating means. `avoid` holds what
  the reader wrote plus did-not-finish books.
- **`did-not-finish` is an avoid entry.** The export has this exclusive
  shelf; D1 does not mention it. Not finishing is a clearer signal than a
  rating, so the book goes to `avoid` as "Title — Author (did not finish)"
  whether or not it was also rated.
- **`currently-reading` is dropped.** Recommending a book the reader is
  holding is useless; putting it in `to_read` would do that.
- **Unrated `read` books are dropped.** No signal about taste, and they
  would eat the cap.
- **The cap's priority order.** D2 says "by recency and rating" without an
  order. Sorting purely by rating then recency would fill 60 slots with
  5-star books and discard every 1 and 2, losing the avoid signal; sorting
  purely by recency would discard older 5s. Chosen: dislikes (1, 2) always
  survive, then 5s, then 4s, then 3s, most recent first within a rating.
  On the real export this keeps all 7 dislikes and the 53 most recent 5s (results.md; the 8 and 52 first written here were a miscount).
  Task 4 may move it; the caps are flags on the command.
- **Titles verbatim, series suffix kept.** "Reign & Ruin (Mages of the
  Wheel, #1)" stays as Goodreads wrote it: the series tells the model that
  book 2 on a shelf is a strong pick. Only whitespace runs are collapsed.
- **Flat shape with prompt v2 is upgraded; a structured object is laid out
  whatever the prompt.** The flat shape with `recommend_v1` is still sent as
  JSON, so change 001's rows stay comparable. The `preferences` column logs
  the object as given, not the upgraded or laid-out form.
- **`--base` on import.** The export has no genres or free text; the
  command takes an existing preferences file for those so the eval can run
  "the export plus Marina's genres" without a hand-merged file.
- **Migration timestamp `20260903120000`.** The `sessions` migration is
  another worker's and was not visible at the time; the lead checks it
  sorts earlier before `db push`.
