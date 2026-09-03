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
