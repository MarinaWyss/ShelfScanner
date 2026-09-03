# 008 — Results

## Caching

Date: 2026-09-03, task 4. Decided by 007's numbers (D3): 4.5 s p50 per
scan against the scoping doc's 3 s line, and 329 read strings that were 88
distinct pairs. Built: `lookup_cache` (migration
`20260903160000_lookup_cache.sql`), consulted by `lookup_batch` before the
catalogue; `lookups.cache_hits`. Spec: `docs/specs/book-lookup.md`,
"Cache". Spend: $0; no model was called.

**How it was measured.** `verify.verify_extraction` three times over the
latest Sonnet-direct extraction of each core photo (extractions 45 to 49,
`extract_v1` at 1568 px, 70 titles), against the real database and the
live Open Library. Because only the lead pushes migrations, the cache was
an in-process store with the table's interface (`lookup.MemoryCache`)
substituted for `cache_for`, and the `lookups` inserts were skipped
because the column is not there yet; the `books` upserts went to the real
table. **The lead reruns this after `supabase db push`** with the real
store; the scratch script is `measure_cache.py` in the worker's scratchpad
and takes about a minute. The run was done twice, an hour apart, because
Open Library's speed varied that much.

**Cold pass** (empty cache; a later photo may already find pairs an
earlier one wrote, which is why photo 2 shows cache hits):

| Photo | Titles | Run 1: lookup ms, calls, cached, errors | Run 2: lookup ms, calls, cached, errors |
|---|---|---|---|
| 1 | 15 | 3363, 15, 0, 0 | 4024, 15, 0, 1 |
| 2 | 14 | 4009, 9, 6, 3 | 6391, 10, 5, 0 |
| 3 | 11 | 4341, 12, 1, 0 | 4754, 12, 1, 0 |
| 4 | 12 | 4553, 18, 0, 0 | 6165, 18, 0, 0 |
| 5 | 18 | 6056, 19, 1, 0 | 6907, 18, 1, 6 |
| **p50 / max** | | **4.3 s / 6.1 s** | **6.2 s / 6.9 s** |

007 measured the same five scans cold at 4.7 s p50 and 6.1 s max. Run 1
is no slower; run 2 is, and the difference is the catalogue, not the
cache: the store's read of an empty dict is under a millisecond, and the
slow run is the one with seven connect timeouts (errors) from Open
Library. A cold scan's time is Open Library's request rate, as before.

**Warm pass** (the same scan again):

| Photo | Run 1: lookup ms, calls, cached | Run 1: verify ms | Run 2: lookup ms, calls, cached | Run 2: verify ms |
|---|---|---|---|---|
| 1 | 0, 0, 15/15 | 96 | 1, 0, 15/15 | 87 |
| 2 | 2264, 3, 11/14 | 2342 | 0, 0, 14/14 | 80 |
| 3 | 0, 0, 11/11 | 84 | 0, 0, 11/11 | 82 |
| 4 | 0, 0, 12/12 | 80 | 1, 0, 12/12 | 129 |
| 5 | 0, 0, 18/18 | 81 | 2498, 7, 12/18 | 2567 |

`verify ms` is the whole of `verify_extraction`, including the `books`
upsert to the real database, which is nearly all of it on a warm scan.

**Pass line: a repeated scan verifies in under 1 s.** Eight of ten warm
scans did, in 80 to 130 ms with no catalogue call. The two that did not
(photo 2 in run 1, photo 5 in run 2) are the scans whose cold pass had
catalogue errors: an error is never cached, so those titles alone were
asked again (3 and 7 calls) while the rest came from the cache. A third
pass in run 2 settled every scan at 0 to 1 ms of lookup, 0 calls, 64 to
322 ms of verification. So: a repeated scan verifies in under a second
once the catalogue has answered for every title, and a title the
catalogue failed on is retried on the next scan rather than remembered as
a miss. That is the intended behaviour (D2), not a gap.

**Pass line: a cold scan no slower than before.** Run 1 4.3 s p50 against
007's 4.7 s; run 2 slower for the reason above. The cache adds one read
and one write to the database per batch (two selects, two upserts in the
Supabase store, none per title); the lead's rerun with the real store
measures that cost, expected in the tens of milliseconds.

**Hit rate.** The five core photos read 70 titles that are 62 distinct
keys (56 records, 6 misses), so even a first pass over the set found 8
titles in the cache from an earlier photo (photos 1 and 2 share a shelf).
On the repeated pass 100 % of the titles the catalogue had answered for
came from the cache. Across the whole 007 set (329 strings, 88 pairs) the
steady-state rate would be about three in four, as tasks.md estimated;
`lookups.cache_hits / (hits + misses)` is the metric for real scans, which
009's dashboard can read.

**What the results found while kept.** The kept and dropped lists are the
same warm as cold (the cached record is scored against the pair as read
with the same arithmetic), except that a title the catalogue timed out on
cold was kept unverified then and verified or dropped warm; that is the
retry doing its job.

**Decided during the work** (recorded in the proposal): what counts as a
cache hit, errors never cached, the foreign key to `books`, the store's
tolerance, the `verify.py` lines, and the migration's hand-picked
timestamp.

**Open.** The `lookups` insert names `cache_hits`, so the migration must be
pushed before this branch is merged or every verification will fail its
`lookups` write. `tests/test_verify.py`'s `FakeDB` has no `select`, so in
those tests the store logs "unavailable" and runs cold, which is the
behaviour under test anyway; extending that fake would silence the
warnings. `lookup_cache` has no expiry job; misses expire by `fetched_at`
at read time, and records are kept, so the table grows with distinct pairs
read, roughly one row per new book seen.

**Real store (lead, 2026-09-03, after `supabase db push`).** The same
five extractions, this time through the `lookup_cache` table itself, with
`lookups.cache_hits` written. Open Library was unhealthy during the cold
pass (seven connect timeouts, cold lookups 4.3 to 8.5 s), so the first
warm pass still re-asked for the errored titles. Once every title had an
answer:

| pass | lookup p50 | verify p50 | catalogue calls |
|---|---|---|---|
| cold (007 baseline) | 4.5 s | – | 1 per title |
| warm, all titles cached | 128 ms | 262 ms | 0 |

Verify time includes the `books` upsert and the `lookups` insert. A bare
`lookup_cache` select from this machine is about 80 ms, so the two round
trips are the whole warm cost. The 3 s verification line is met by a wide
margin on a repeated shelf; a first-seen shelf is still bound by the
catalogue. `lookup_cache` held 61 rows after the run; the migration passed
`supabase db advisors --linked` with only the pre-existing
`rls_auto_enable()` warning.

## Limits, errors and validation

Date: 2026-09-03, tasks 1 and 2, one worker. Spend: $0.01 (one live scan
by the lead). Spec: `docs/specs/web.md` (limits, validation, the status
lock, the five visible stages, retry), `docs/specs/photo-storage.md` (the
`status`, `status_at` and `resized_by_client` columns, migration
`20260903170000_scan_status.sql`, pushed 2026-09-03).

- **Limits.** Ten scans per device per rolling hour (429) and a $5 app-wide
  spend per UTC day summed from the runs tables (503), both from env,
  both with the number in the message. `tests/test_web_limits.py` (10) with
  a fixed clock and seeded rows; `tests/e2e/test_hardening.py` drives the
  N+1th scan and the cap through the page.
- **Errors.** A failover that also fails names both attempts on the page
  and offers "Try again", which is a new scan. The fake pipeline now runs
  through `router.with_failover`, so the Playwright case exercises the
  real path. Checking is shown as its own stage.
- **Validation.** Declared type and bytes must both be JPEG or PNG (MPO
  from phones counts as JPEG), long edge at least 400 px, checked on the
  header before the resize; refused uploads store no row.
- **003's open issues closed.** `photos.status` is the lock: a second
  connection to the event stream waits on the claim instead of running the
  model twice; `last_seen_at` is written at most once per ten minutes;
  `resized_by_client` records the browser-resize fallback rate.
- **Live check by the lead** against the real project after the migration
  push: one scan through the app, reading (failover to Sonnet) → checking →
  choosing (failover to Haiku) → done in 18 s; the row ended
  `status = done`, `resized_by_client = true`; `/admin` was 404 without the
  key and 200 with it. The PostgREST claim filter the worker could not
  test live worked on the first try.

## Retention

Task 3, 2026-09-03. `photos retain [--dry-run] [--days]` deletes bucket
objects for unlabelled session photos older than the window (default 30
days), nulls `storage_path`, sets `photo_deleted_at`, never touches a
labelled photo. `tests/test_retention.py` (20). Scheduled daily by
`.github/workflows/retention.yml` until 010 moves it to Vercel cron. The
first scheduled run (2026-09-03 08:58 UTC) failed in nine seconds: the
repository has no `SUPABASE_URL` / `SUPABASE_SECRET_KEY` secrets yet, which
is on Marina's list. It will pass the night after they are added; nothing
to change.

## Gates

| Question | Pass |
|---|---|
| Limits | `tests/e2e/test_hardening.py`: the N+1th scan in an hour is refused with the message; the cap stops scans |
| Errors | Playwright: a stubbed provider failure after failover shows the stage and "Try again" |
| Retention | `tests/test_retention.py`: a photo dated 31 days ago is gone after the job, a test-set photo is not |
| Caching | Above: 4.5 s cold → 0.26 s warm on a repeated shelf, 0 catalogue calls |

Suite after the merges: 353 tests, ruff clean, `research.check` PASS, CI
green. The `/code-review` reviewer agent was killed by the Claude Code
spend limit on tasks 1 and 2; the lead reviewed the diff by hand instead.

Also in this change: `revoke execute` on `public.rls_auto_enable()` from
`anon`, `authenticated` and `public` (migration
`20260903180000_revoke_rls_auto_enable.sql`), the one advisor warning the
project had carried since before 001. The function is not ours and no
client calls it; if it turns out to be wanted through the API, one
`grant` puts it back.

Open for later: `lookup_cache` has no cleanup job (grows one row per new
pair read); `docs/specs/run-logging.md` describes the CLI spend cap and
points to `web.md` for the app's.
