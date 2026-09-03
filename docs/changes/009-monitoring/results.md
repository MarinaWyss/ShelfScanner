# 009 — Results

Date: 2026-09-03. Tasks 1 and 2 by one worker, task 3 and D1 by the lead.
Spend: $0 (no model calls; the review draft reads rows).

**Metrics module** (`src/shelfscanner/web/metrics.py`): windows of whole UTC
days, per-stage p50/p95/cost/spend/errors/failovers, the model-versus-
application error split, lookup and cache hit rates, save rate per day,
price staleness. `research/report.py` now takes its p50, cost, error and
failover figures from it (D1); `research.check` still passes against the
001 baseline with identical numbers.

**Dashboard** (`/admin?window=7|30|all`, `web/admin.py`): behind
`SHELFSCANNER_ADMIN_SECRET` via `?key=` or an HttpOnly cookie scoped to
`/admin`; 404 without it, or when the secret is unset. Server-rendered
tables, two sparklines, price line. No session cookie is issued on
`/admin`. Real data on 2026-09-03, all time: 64 test-set photos, 180
extraction rows (p50 5.5 s, p95 15.7 s, $0.0109 per scan), lookup hit
rate 84 %; three app scans, 67 % complete, five failovers. `fetch("7")`
takes 0.5 s.

**Weekly review** (`research/review.py`, `docs/reviews/PROMPT.md`,
`.github/workflows/weekly-review.yml`): drafts `docs/reviews/<date>.md`
from the rows since the last file, a Claude Code agent writes the two
reviewer sections and opens a PR. Off until `WEEKLY_REVIEW=1`. Seeded by
hand: `docs/reviews/2026-09-03.md`, whose two patterns (truncations at
4,096 tokens, OpenRouter 429s) were both already closed by 002 and the
fallback change; suggested change: none.

## Gates

| Question | Pass |
|---|---|
| Numbers match | `tests/test_metrics.py`: the page's figures equal the report's over the same seeded rows; live, the FEEDBACK line was byte-identical |
| Review runs | One file (2026-09-03, by hand). The second is the first scheduled run, Monday 2026-09-07, once `WEEKLY_REVIEW=1` and the secrets exist. **Pending.** |
| Nothing exposed | `tests/test_web_admin.py`: `/admin` without the secret is a 404; unset secret is a 404; live check the same |

The change stays in `docs/changes/` until the second review file exists;
`docs/specs/monitoring.md` already describes the behaviour.

## Decided during the work

W1 to W8 in the proposal (worker). Lead: `/admin` added to the session
middleware's unsessioned prefixes; the report's failover count is now over
its deduplicated rows like its other figures (W3 notes the page counts
every call); the review's "pattern" threshold is three rows of one kind or
a title marked twice.

## Open

- Test-set "scans per day" reads oddly when matrix reruns land on one day.
- The sparklines have no axis.
- `lookup_cache` growth (see 008 results).
