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

## How we know it worked

| Question | Pass |
|---|---|
| Limits | Playwright: the N+1th scan in an hour is refused with a message; the daily cap stops scans |
| Errors | A stubbed provider failure after failover shows the stage and a retry |
| Retention | A photo dated 31 days ago is gone after the job; a test-set photo is not |
| Caching | results.md shows the lookup numbers and what was done |
