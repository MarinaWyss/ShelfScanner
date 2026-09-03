# 008 — Hardening: limits, cost cap, retention, errors; caching if measured

Status: approved 2026-09-02
Date: 2026-09-02
Deadline: 2026-09-30
Spend cap: $5
Track: app (after 005; parallel with 007)

## Why

By now the app is live with real scans and no protection against a bad
day: a link shared wider than expected, a provider outage mid-scan, photos
accumulating in a private bucket with no deletion, a lookup that turns out
slow. This change puts the numbers from the scoping doc's constraints
table into code.

## What changes

- Rate limit per session: scans per hour, from config, with a plain
  message when hit. A global daily spend cap in the app, reading the runs
  table, that stops scans with a message rather than silently degrading.
- Error handling audit: every stage failure reaches the page with the
  stage named; provider errors after failover show a retry; nothing is
  shown that was not checked (R1).
- Retention: a scheduled job deletes photo objects older than 30 days and
  nulls the storage path; rows stay for the metrics. Test-set photos are
  exempt.
- Input validation: type, size, dimensions; a non-image is rejected before
  it reaches the bucket.
- Caching, only if 007's numbers cross the scoping doc's line (lookups
  over 3 s p50 or over a cent per scan): the `books` table consulted
  before the catalogue, with a hit-rate metric. Otherwise a one-line note
  in results.md with the numbers and no code.

### Out of scope

- Accounts, abuse detection beyond the per-session limit.

## Decisions

**D1. Limits fail loud.** A user who hits a limit is told, with the number.
Silent degradation would corrupt the save-rate metric.

**D2. Thirty days is the retention default.** Long enough to debug a bad
scan, short enough that a bucket of other people's rooms does not
accumulate. A config value.

**D3. Caching is decided by the runs table, not by taste.** The line is in
the scoping doc; this change reads the number and acts on it either way.
Read on 2026-09-03 from 007's measurement: 4.5 s p50 against a 3 s line,
so the cache is in scope (tasks, step 4).

## Decided during the work

Task 3, retention (2026-09-03):

- **Exemption is by label, not by session.** A row is exempt when `titles`
  is non-empty or `set` is anything but the default `core` (the column may
  not exist yet; a failed `select` of it means it is absent). `session_id`
  is not used: a test-set photo is identified by its label, and an
  unlabelled row with a null session is still someone's room. The rule is
  sent to the server as a filter and re-applied client-side to every
  returned row, so a mistake in either alone cannot delete the test set.
- **Rows keep their history.** `storage_path` becomes nullable and
  `photo_deleted_at timestamptz` records the deletion; a check constraint
  requires one or the other. The unique constraint stays, so `photos sync`
  still upserts on `storage_path`.
- **Object first, then the row.** A failure between the two leaves a row
  pointing at a missing object, which the next run repairs; the reverse
  would leave an orphaned object. Removing a missing key is not an error.
  One failed deletion does not stop the rest; the command exits non-zero
  if any failed, so the workflow run goes red.
- **The window is `SHELFSCANNER_RETENTION_DAYS`** (default 30), read from
  the environment or `.env` at run time, with `--days` as an override.
  Age is `created_at`, strictly older than `now - window`.
- **Schedule.** GitHub Actions daily at 04:17 UTC plus manual dispatch
  with a `dry_run` input, until 010 moves it to Vercel cron. The
  workflow needs the `SUPABASE_URL` and `SUPABASE_SECRET_KEY` repository
  secrets and reads an optional `SHELFSCANNER_RETENTION_DAYS` variable.

Task 4, caching (2026-09-03):

- **A cache hit is a title answered without a catalogue call**, whether
  the answer is a record or a fresh miss. Both save the network round
  trip, which is what the metric is for; `lookups.cache_hits / (hits +
  misses)` is the hit rate.
- **A catalogue error is never cached.** A timeout or a non-200 is not an
  answer; the title is asked again on the next scan. So a repeated scan
  is only fully warm once the catalogue has answered for every title,
  which the measurement shows (results.md).
- **Records do not expire; misses expire after 30 days**, as tasks.md
  says. A record's `books` row is the source of truth for its fields, so
  a stale cache row cannot show stale data; a miss is re-asked so a newly
  catalogued book is found.
- **The cache row references the `books` row** (`(catalogue,
  catalogue_id)`, cascade). A cached record then always has a row to
  resolve from, and deleting a book drops its cache rows. The store
  writes `books` first for that reason. The natural key is the primary
  key: it is the only way the table is read.
- **The store is behind an interface** (`lookup.CacheStore`): the
  Supabase store for the app, an in-memory one for tests and for
  measuring before the migration is pushed. A store failure runs the
  batch cold and writes nothing back, logged, never raised: the rule for
  a catalogue failure (007 D2) applies to the cache too.
- **`verify.py` got five marked one-line changes**, not the one the task
  allowed for: passing the store (`cache=lk.cache_for(db)`), the
  `cache_hits` column on the `lookups` insert, the field on `Verified`,
  its constructor argument, and `cached n/total` in `line()`. The count
  has to reach the row somewhere, and `record()` is where the row is
  written.
- **The migration's timestamp was chosen by hand** (`20260903160000`):
  `supabase migration new` stamped 14:15 UTC, which sorts before the
  saved-feedback migration already in the folder. The Supabase skills
  were read first; `supabase db advisors --linked` is for the lead to
  run at push time, since a worker does not touch the linked project.
- **The measurement used the in-memory store** and skipped the `lookups`
  inserts (the column does not exist until the push). The lead reruns it
  with the real store after pushing; the numbers to beat are in
  results.md.

## How we know it worked

| Question | Pass |
|---|---|
| Limits | Playwright: the N+1th scan in an hour is refused with a message; the daily cap stops scans |
| Errors | A stubbed provider failure after failover shows the stage and a retry |
| Retention | A photo dated 31 days ago is gone after the job; a test-set photo is not |
| Caching | results.md shows the lookup numbers and what was done |
