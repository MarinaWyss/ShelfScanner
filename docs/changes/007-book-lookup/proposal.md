# 007 — Book lookup or enrichment

Status: approved 2026-09-02; scope set by 006 on 2026-09-03: verification
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

## Scope, set by 006 on 2026-09-03

**Verification.** 006 counted invented titles well above zero on the
sourced and derived sets, with the mechanism (merged or filled-in spines
under dense, blurred or small input) independent of the model. 006's
results also refined what verification means: a title can be a real book
that is not on the shelf, so the check is "does a catalogue record match
what was read closely enough", and unverified titles are dropped from
the list the chooser sees, with the drop logged.

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

## Decided during the work

Tasks 1 and 2, 2026-09-02.

- **Query variants on a miss.** Open Library's title search needs every
  word of the query in the record's title, so a full title with a subtitle
  the catalogue does not carry returns nothing ("Apocalypse Never: Why
  Environmental Alarmism Hurts Us All" found 0; "Apocalypse Never" found
  the book first). A wrongly read author hides a book the same way. The
  module therefore tries, in order: title with author, part before a colon
  with author, title alone, main title alone, stopping at the first record
  over the threshold. A hit is one request; a true miss is at most four.
- **Scoring.** `matching.similarity(read_title, catalogue_title)` plus a
  0.10 bonus for an author match (ratio 0.8 on normalised names, or a
  shared surname of three or more letters), capped at 1.0; accept at the
  config `match_threshold`; ties go to the catalogue's relevance order. No
  penalty for an author mismatch: the goal is to verify the title, and a
  misread author should not drop a real book.
- **Record fields.** `author` is the first three `author_name` entries
  joined with ", " (anthologies list dozens); `cover_id` is `cover_i` as
  text; `catalogue_id` is the work key without `/works/`.
- **`errors` column on `lookups`.** Beyond the contract's hits, misses and
  latency: D2 says an unavailable catalogue is logged, and a row that
  cannot tell "not found" from "catalogue down" cannot show that. Errors
  are also counted in misses, so `hits + misses` is the number of titles.
- **User-Agent without a contact address.** Open Library asks clients to
  identify themselves; the header names the project and repository URL,
  and no email is sent to a third party.
- **Failures never raise.** `httpx.HTTPError` and a non-JSON body are
  caught, logged at warning level, and count as an error; anything else
  is a bug and propagates.
- **Known limitation.** A generic title read without an author can resolve
  to a different book with the same words: "Götter und Heldensagen" (Schalk,
  read off a Fraktur spine) resolves to Scheffer's "Römische götter- und
  heldensagen" at score 1.0, because `similarity` accepts a form of the
  catalogue title contained whole in the read title. With the author the
  query is right. Whether this matters depends on 006's decision:
  verification only needs "a real book"; enrichment would show the wrong
  cover. Left for task 4 to measure on the full test set.

Tasks 3 and 4, 2026-09-03.

- **Per-title degradation, not per-scan.** D2 says an unavailable
  catalogue never fails a scan. Applied per title: a title whose lookup
  failed is kept as read and marked unverified; a title the catalogue
  answered for with no record is dropped. So one timeout among good
  answers does not pass the whole list through unchecked, and a full
  outage passes every title through with `catalogue_down` set. The
  `lookups` row still counts errors in misses.
- **One record, one title.** Two read strings resolving to the same record
  ("Americn Gods" after "American Gods", "AKIRA 2" after "AKIRA") keep the
  first and drop the rest with reason `same record as an earlier title`,
  so the chooser's list has each book once. The `lookups` row counts both
  as hits; the merge is verification's, not the catalogue's.
- **No author search.** 006 suggested resolving an author-only string by
  an author lookup. The module has no author search and none of the 329
  strings on the core and derived sets was author-only, so it is not
  built; such a string is looked up as a title and dropped. Open on the
  sourced set.
- **The pick carries the record.** Beyond `verified: true/false`, each
  stored pick gets `catalogue_id` and `cover_id`, so the web layer can
  show the cover without a join. Nothing else in the row changes.
- **Per-item detail in `lookup.Batch`.** The contract's `lookup_batch`
  gained `item_errors` and `nearest` (the best candidate under the
  threshold), both defaulted, so verification can apply the rule above
  and name the near miss in the drop log. `lookup` itself is unchanged.
- **The measurement is a first-run number.** Open Library caches its own
  searches; a repeat of the same shelf is about a third faster. The
  results report the cold run, since that is what a user sees.
- **Both pass lines missed, shipped anyway.** 85 % of label-matched
  strings resolve (line: 90 %) and the check costs 4.5 s p50 (line: 2 s).
  Both are properties of the catalogue and the query shape, not of the
  wiring; the drops on sharp photos are real books Open Library lacks,
  and the list left for the chooser is still eleven titles. The fixes are
  listed in `results.md` for 008 and the next lookup change.
