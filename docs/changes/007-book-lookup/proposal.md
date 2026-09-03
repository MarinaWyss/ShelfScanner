# 007 — Book lookup or enrichment

Status: approved 2026-09-02, scope set by 006
Date: 2026-09-02
Deadline: 2026-09-30
Spend cap: $5
Track: quality

## Why

The scoping doc puts a real-catalogue step between reading and choosing
for two reasons: to catch a title the model invented, and to show the user
a real author and cover instead of a transcription. Change 001 showed
invention is a model property and the chosen model did not invent on the
test set. 006 measures that on sourced and degraded photos and decides
which of the two reasons still stands.

## What changes

Either way:

- A lookup module against Open Library's search API, matching on title
  plus author with the existing fuzzy matcher, returning canonical title,
  author, first publish year, cover id. Concurrent requests per shelf,
  bounded.
- A `books` table of records found, keyed by the catalogue id, referenced
  from the pick. Whether the lookup consults it before calling out is the
  caching question in 008, answered by the numbers this change logs.
- Lookup latency and hit rate logged per scan.

If 006 chose **verification**: the lookup runs between extraction and
recommendation, titles with no record are dropped and logged (L1), and
the drop rate is a reported metric.

If 006 chose **enrichment**: the lookup runs after recommendation on the
five picks only, off the critical path where possible, and a miss shows
the transcription with no cover (L2 relaxed).

### Out of scope

- Caching (008, by the numbers).
- Purchase links.

## Decisions

**D1. Open Library first.** Free, no key, adequate coverage for English and
German trade books. Swappable behind the same module if coverage fails.

**D2. Unavailable catalogue never fails a scan.** Verification degrades to
"unverified" and is logged; enrichment degrades to no cover. This closes
the open question in the scoping doc.

## How we know it worked

| Question | Pass |
|---|---|
| Finds real books | At least 90 % of labelled titles on the test set resolve to a record |
| Cheap in time | Lookup adds under 2 s p50 per scan in verification mode; off the critical path in enrichment mode |
| Degrades | A test with the catalogue stubbed as down completes the scan |
| Nothing regressed | `research.check` passes |
