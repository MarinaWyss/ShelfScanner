# 007 — Tasks

Work in order. ∥ marks tasks that can run in parallel worktrees.

## 1. Lookup module ∥

- Open Library search with title and author, fuzzy match on the result,
  bounded concurrency, timeout, a recorded fixture for tests.

## 2. Schema ∥

- Migration: `books` (catalogue id, title, author, year, cover id,
  fetched_at); `lookups` per scan (hits, misses, latency).

## 3. Wire it, per 006's decision

- Verification: between extraction and recommendation; drops logged.
- Enrichment: after recommendation, picks only, background where the web
  layer allows.
- Progress event "checking titles" in the app.

## 4. Measure

- Hit rate on the test set; latency per scan; the caching numbers for 008.

## 5. Specs, results, archive

- `docs/specs/book-lookup.md`; `recommendation.md` and `web.md` updated.

## Follow-ups from task 4 (not blocking archive)

- Query shape: when the read string has a colon and the part before it
  matches a record's author, search the part after the colon as the title
  with the part before as the author, and prefer that record. Fixes the
  two wrong-record matches ("Archie Brown: The Rise and Fall of
  Communism", "Schalk: Götter und Heldensagen"). The matcher itself stays
  as is: "Author: Title" and "Title: Subtitle" are indistinguishable
  without the record's author, and the subtitle rule is what change 001
  needs.
- Try the title alone before title-with-author for strings where the
  author was glued into the title field.
- A second catalogue for recent and self-published books, if the miss
  rate on real scans says so.
- Wrong record, wrong author, wrong reason: on a real scan the catalogue
  matched the Avatar comic "Smoke and Shadow" to Tanya Huff's novel and
  the chooser reasoned from her name. When the read string carried an
  author that disagrees with the record's, keep the read author for the
  chooser and mark the record uncertain; a record's author must never
  overwrite one the model read off the spine.
