# 008 — Tasks

Work in order. ∥ marks tasks that can run in parallel worktrees.

## 1. Limits ∥

- Per-session scans per hour and a daily spend cap, both from config;
  messages on the page; tests with a clock and a seeded runs table.

## 2. Errors and validation ∥

- Carried over from 003's open issues: a second connection to
  `/scan/{id}/events` while a reading is in flight must not run the model
  twice (a status column or a lock); `last_seen_at` is written on every
  request and should be throttled; the browser-resize fallback rate is
  only logged and wants a column if it matters.

- Audit each stage's failure path to the page; provider failure after
  failover shows a retry; input validation before the bucket.

## 3. Retention ∥

- Scheduled job (GitHub Actions until 010, Vercel cron after) deleting objects older than
  the config window, nulling `storage_path`, exempting labelled photos.

## 4. Caching, decided by 007's numbers on 2026-09-03: build it

- 007 measured lookup at 4.5 s p50 per scan (Open Library serves about
  six requests a second to one client, about one request per title),
  against the scoping doc's line of 3 s. And 329 read strings were 88
  distinct (title, author) pairs, so a cache keyed on the normalised
  read string answers roughly three lookups in four on repeated shelves.
- Build: consult `books` (and a `lookup_cache` of read string to
  catalogue id or miss, with a fetched_at) before calling the catalogue;
  misses expire after 30 days so a newly catalogued book is found;
  hit-rate and latency logged on the `lookups` row.
- Pass: a repeated scan of a core photo verifies in under 1 s; a cold
  scan is no slower than before.

## 5. Specs, results, archive

- `docs/specs/web.md`, `photo-storage.md`, and `book-lookup.md` if cached.
