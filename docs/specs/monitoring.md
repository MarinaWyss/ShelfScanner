# Monitoring

The numbers the scoping doc's section 7 asks for, computed from the rows
every scan already writes, shown on one page. `src/shelfscanner/web/metrics.py`
is the aggregation; `src/shelfscanner/web/admin.py` is the page;
`research/review.py` drafts the weekly review.

## Vocabulary

The page and the CLI report use these words the same way.

- A **scan started** is a `photos` row. A scan belongs to the UTC day its
  photo was stored, and so do all the rows joined to it (its extractions,
  lookups, recommendations, saves and marks), whenever those were written.
- A **scan with picks** is a recommendation row without an error: one that
  put picks on a screen. It is the denominator of the save rate (005).
- A scan is **complete** when it has a recommendation row without an error.
  A choosing that failed before a model ran (the catalogue check dropped
  every title) also has a row, with `error` prefixed `checking:`; it counts
  as a model failure on the page and shows up under that kind in the review.
- **App scans** are photos with a session (003). **Test set** photos are
  the ones with ground-truth titles, the same filter the report applies.
  The page shows the two populations side by side; nothing is mixed.
- A **model failure** is an extraction or recommendation row with `error`:
  the call ran and the reply was unusable. An **application failure** is a
  photo with no extraction row at all: the scan never reached a model. A
  scan still in flight shows as an application failure until its row lands.
- A **window** is a whole number of UTC days ending today (`7`: today and
  the six days before it; `30`), or all time.

## The metrics

For each population over the window:

- Scans started, and scans per day (started over the days in the window).
- Scans with picks, and the completion rate (complete over started).
- Saves per scan and not-for-me per pick, exactly `metrics.compute` from
  005: live saves (a `saved` row with `removed_at` null) over scans with
  picks; picks marked once each over all picks of those scans.
- Per stage: rows, latency p50 and p95, cost per scan, spend, errors,
  failovers. Reading is the `extractions` rows, choosing the
  `recommendations` rows, checking the `lookups` rows (`latency_ms` is
  the wall time for the whole shelf). Latency and cost per scan are over
  rows without an error, as the report's are; spend sums every row's
  `cost_usd`, errors included, because that is what the spend guard sees.
  Percentiles interpolate linearly between order statistics, so p50 is
  exactly the median the report prints. Checking has no cost and no
  failover; its errors column counts scans where any lookup failed.
- Model failures over model rows, application failures over scans, and
  the failover count (rows with `failover_from`, both stages).
- Lookup: titles looked up (`hits + misses`), hit rate, catalogue errors
  (titles), and the cache hit rate from `lookups.cache_hits` (008); over
  rows from before that column the page says "not recorded".
- The price check (002 D5): `prices_checked` from `config/models.toml`
  and its age; stale when older than 90 days or missing, shown in the
  accent colour.

A per-day series (scans started, scans with picks, live saves) feeds the
two sparklines: scans per day and save rate per day, app scans only.

## Where the numbers come from

`metrics.fetch(window)` reads `photos`, `extractions`, `recommendations`,
`lookups`, `saved` and `feedback`, each filtered on `created_at >=` the
window's start and paged a thousand rows at a time, then drops any row
not joined to a photo in the window. `metrics.dashboard(rows, window)`
does the rest and is pure, so it is tested on seeded rows and on the
fake pipeline's rows. Under `SHELFSCANNER_FAKE_PIPELINE=1` the page reads
the fake pipeline's memory (`metrics.rows_from_memory`): the fake records
no latency or cost and runs no lookups, so those cells show a dash.

The report (`research/report.py`) reads the same tables. Where the two
show the same thing (save rate, error and failover counts, p50 latency,
mean cost) they use the same functions. The one deliberate difference:
the report's per-model tables keep the latest row per photo within a
model, because a rerun supersedes; the page counts every call, because
every call had a latency and a cost.

## The page

`GET /admin?window=7|30|all` (default `7`; anything else falls back to
`7`). Server-rendered, phone widths first, the same layout as the rest of
the app: the window as chips, two sparklines, then tables for overview
(metric, app scans, test set), stages (one table per population), errors
and lookup, and the price line. Wide tables scroll inside their own box.
The overview table carries `id="overview"` and `data-window`.

## Access

The page is a 404, indistinguishable from a missing route, unless the
request carries `?key=<secret>` or the cookie `shelfscanner_admin` with
that value, compared in constant time against `SHELFSCANNER_ADMIN_SECRET`
from the environment. With no secret set the page is always a 404. An
authorised response sets the cookie (`HttpOnly`, `SameSite=Lax`, path
`/admin`, thirty days), so the window links carry no key. There is no
login page and no logout; clearing the cookie is the logout.

## Tests

`tests/test_metrics.py`: windows, populations, per-day series, completion
and feedback rates, per-stage percentiles and cost, the error split,
lookups with and without the cache column, the price check, agreement
with `research.report` over the same rows (009 D1), and the fake
pipeline's rows after a scan. `tests/test_web_admin.py`: 404 with no
secret, with a wrong key, with a wrong cookie; 200 with the key and then
with the cookie alone; the seven-day table's numbers after a scan with
saves and a mark; a failed reading counted as a model failure; every
window; the sparkline points and the formats. `tests/e2e/test_admin_page.py`
drives the page in Chromium against the fakes: a scan, the seven-day
table with it, the thirty-day link off the cookie, 404 without either.

## The weekly review

Every Monday at 06:17 UTC (`.github/workflows/weekly-review.yml`, on when
the repository variable `WEEKLY_REVIEW` is `1`) `research.review` drafts
`docs/reviews/<date>.md` from the rows written since the previous review
file, then a Claude Code agent fills in the two reviewer headings under
`docs/reviews/PROMPT.md` and opens a pull request titled `Weekly review
<date>`. The review changes no code; a repeated pattern becomes a
suggestion Marina turns into a proposal (009 D2).

The draft has, for app scans and the test set separately: scans started,
complete, saves; model failures (rows with `error`) grouped by stage,
model and the head of the error text, with up to three examples each;
application failures (photos with no extraction row); failovers grouped by
the primary's `failover_error`; every "not for me" mark with the pick's
title, the model's reason and the model. "Patterns" at the top lists any
group of three or more and any title marked twice.

`uv run python -m research.review --since 2026-08-27 --stdout` runs the
draft by hand. Tests: `tests/test_review.py` over seeded rows.
