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
