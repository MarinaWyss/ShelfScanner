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
