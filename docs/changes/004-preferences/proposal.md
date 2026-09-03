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
