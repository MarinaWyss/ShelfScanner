# 009 — Monitoring: a dashboard from the rows, a weekly review

Status: approved 2026-09-02
Date: 2026-09-02
Deadline: 2026-09-23 (the roadmap's date; 2026-10-07 was written here first)
Spend cap: $5
Track: either (after 005)

## Why

Every call is already a row. What is missing is a way to see the rows
without writing SQL, and a habit of looking. The scoping doc's section 7
names the metrics and a weekly review; this change builds the page and
schedules the review so it happens without anyone remembering.

## What changes

- A dashboard page at `/admin`, behind a single shared secret in `.env`,
  rendered from the runs, saved and feedback tables: scans per day, save
  rate, not-for-me rate, latency p50 and p95 per stage, cost per scan per
  stage, error rate split model versus application, failover count,
  lookup hit rate. Seven-day and thirty-day windows.
- The price-staleness check from 002 D5 surfaced on the page.
- A weekly scheduled agent (Claude Code routine) that reads the error rows
  and the not-for-me rows since the last run, sorts them into model
  versus application failures, and writes `docs/reviews/<date>.md` with
  counts, examples and a suggested change if a pattern repeats. It opens
  a pull request; it changes no code.

### Out of scope

- Alerting. Best effort, per the scoping doc.
- An observability product.

## Decisions

**D1. The dashboard reads the same tables `report` reads.** One set of
numbers; the CLI report and the page cannot disagree.

**D2. The review writes a file, not a fix.** A pattern becomes a proposal
Marina approves, which keeps rule 1 intact for unattended work.

## How we know it worked

| Question | Pass |
|---|---|
| Numbers match | The page's seven-day figures equal `report`'s over the same rows in a test |
| Review runs | Two consecutive weekly files exist with counts that match the rows |
| Nothing exposed | `/admin` without the secret is a 404 |

## Decided during the work

Recorded by the worker on tasks 1 and 2 (2026-09-03); see `docs/specs/monitoring.md`
for the behaviour these produce.

**W1. A scan belongs to the day its photo was stored.** Every row joined to a
photo (extractions, lookups, recommendations, saves, marks) is counted in the
photo's window and day, whenever it was written. A save made a week after the
scan moves that scan's save rate, not the week's. This is what makes the
save rate per day meaningful and lets `fetch` filter every table on
`created_at >= start` and still close the join.

**W2. Windows are whole UTC days.** `7` is today and the six days before it,
from midnight UTC; `30` likewise; `all` has no start. Not rolling 168-hour
windows, so a figure read at 09:00 and at 17:00 is over the same days.

**W3. The page counts every call; the report dedupes reruns.** The report's
per-model tables keep the latest row per photo within a model (a rerun
supersedes an earlier attempt at the same input). The page has no per-model
axis, and every row was a real latency and a real cost, so it counts them
all. Without reruns the numbers are identical, and the test asserts both
facts. Save rate, error and failover counts use the same functions in both.

**W4. Latency and cost per scan are over rows without an error; spend is
over every row.** The first matches the report; the second is what the spend
guard sums, and a truncated reply still costs money.

**W5. The application-failure signal is "photo with no extraction row".**
Nothing records an upload failure today (the request fails before a row
exists), so the only observable application failure is a photo whose scan
never reached a model. A scan in flight looks the same for a few seconds;
at weekly volume this is noise and is documented rather than special-cased.

**W6. The cache column is `lookups.cache_hits`, detected at read time.** 008's
caching decision had not landed when this was written. `fetch` reads
`lookups` with `*`; if a `cache_hits` column exists the cache hit rate is
`cache_hits / (hits + misses)`, otherwise the page says "not recorded". If
008 names the column differently, change `metrics.CACHE_COLUMN`.

**W7. The key becomes a cookie.** An authorised response sets
`shelfscanner_admin` (HttpOnly, SameSite=Lax, path `/admin`, thirty days)
holding the key, so the window links carry nothing. The 404 is FastAPI's
default, the same body a missing route returns.

**W8. The dashboard's data source is a seam on the app.** `web/app.py` sets
`app.state.metrics_source = metrics.source_for(pipeline)`: the fake
pipeline's memory when the app runs on fakes, `metrics.fetch` otherwise.
The fake records no latency, cost or lookups, so those cells are dashes in
the Playwright run; the numbers that matter for the tests (scans, picks,
saves, marks, errors) are real.
