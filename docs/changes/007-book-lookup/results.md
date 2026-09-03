# 007 — Results: verification, measured

Date: 2026-09-03. Tasks 3 and 4. Verification (`src/shelfscanner/verify.py`)
run against the live Open Library search API over the latest Sonnet-direct
extraction (`extract_v1`, 1568 px) of each of the five core photos and each
of the twenty derived photos. No language or vision model was called; the
`lookups` rows are ids 1 to 25 and the `books` table holds the 63 distinct
records found. Spend: $0.

## The numbers

| | Core (5 scans) | Derived (20 scans) | All (25 scans) |
|---|---|---|---|
| Titles read | 70 | 259 | 329 |
| Resolved to a record (hit rate) | 60 (85.7 %) | 218 (84.2 %) | 278 (84.5 %) |
| Dropped, no record at the threshold | 10 (14.3 %) | 41 (15.8 %) | 51 (15.5 %) |
| Dropped, duplicate record | 0 | 0 | 0 |
| Catalogue errors | 0 | 0 | 0 |
| Label-matched strings that resolved | 60 / 70 (85.7 %) | 217 / 256 (84.8 %) | 277 / 326 (85.0 %) |
| Invented strings dropped | 0 / 0 | 2 / 3 | 2 / 3 |
| Lookup latency per scan, p50 | 4.7 s | 4.5 s | 4.5 s |
| Lookup latency per scan, max | 6.1 s | 6.1 s | 6.1 s |
| Titles per scan, median | 14 | 12.5 | 13 |

Every scan dropped at least one title; the median scan handed the chooser
11 titles instead of 13.

## What was dropped

The 51 drops are 14 distinct strings, and the derived set repeats each
core shelf five times, so most of the count is the same eight books over
and over. By book:

| Read string (author as read) | Scans | On the shelf? | Why the catalogue said no |
|---|---|---|---|
| Die schönsten Götter-, Helden- und Rittersagen des Mittelalters | 14 | yes | not in Open Library; the search returned nothing at all |
| An Irish Dream | 10 | yes | nearest record "An Irish-American Dream" at 0.71 |
| Schalk * Götter und Heldensagen (Fraktur spine; also read with "–", "-" ) | 9 | yes | the search needs every word in the title and "Schalk" is the author; nothing returned |
| The StatQuest Illustrated Guide to Neural Networks and AI (Josh Starmer) | 5 | yes | not in Open Library (2024, self-published); once misread "StartQuest" |
| Homochronos: Emergence of Time Consciousness (Grether) | 5 | yes | not in Open Library; once read as the subtitle alone |
| Mildly Scenic (label: "…: A Trail Guide to the Lower American River") | 4 | yes | not in Open Library; twice read with an invented subtitle |
| Cody Cassidy: How to Survive History | 1 | yes | author in the title field; the part before the colon is searched, the part after is not |
| Soviel Economic Facts and Fallacies | 1 | yes | "Sowell" misread and glued to the title; every-word search finds nothing |
| **The Book of This and That You Lose the Time** | 1 | **no** | invented (merged spines); nothing returned |
| **The New Midlife** (Paul Danahar) | 1 | **no** | invented (misread "The New Middle East"); nearest "The new mid-life crisis" at 0.73 |

**The three known inventions.** Two of three were dropped: "The Book of
This and That You Lose the Time" (photo 16) and "The New Midlife" (photo
21). The third, "The Wisdom of the Bullfrog" (photo 33), was **kept**: it is
a real book (William McRaven, 2023) and Open Library has it under that
title, so the record matches what was read at 1.0. This is exactly the
case 006 named when it refined L1: a catalogue check tests "is this string
a real book's title", not "is this book on this shelf", and the one
invention that happens to be a real title passes. No catalogue can catch
it; only the reader's confidence or a second look at the image could.

**The cost of the check.** Ten label-matched strings in the core set were
dropped, all eight real books listed above, and no core drop was an
invention because the core extractions had none. So on a sharp phone photo
of one shelf, verification today removes about one real book in seven from
the list the chooser sees and catches nothing, because there is nothing to
catch; on a blurred or small photo it removes the same real books and two
of three inventions. Four of the eight (the German sagas anthology,
StatQuest, Homochronos, Mildly Scenic) are simply absent from Open
Library: obscure, self-published or very recent. The other four are
query-shape failures the module could fix (see "What this suggests").

**Wrong record at full score.** Two label-matched strings resolved to the
wrong book with a score of 1.0, because `matching.similarity` accepts the
part before a colon as a form of the title and a one-word form matches any
record with that word: "Archie Brown: The Rise and Fall of Communism"
resolved to "Archie Brown" by Linden Carter, and "Schalk: Götter und
Heldensagen" (the Fraktur spine, when the model put a colon after the
author) to "Schalk" by Craig Martin. The partial label "Avatar: The Last
Airbender - The Search" likewise resolved to "Avatar". Verification passes
these; enrichment would show the wrong author and cover. This is the
"known limitation" from tasks 1 and 2, now with a count: two books, three
of the 277 resolved label-matched strings on this set.

## Latency

Lookup adds **4.5 s p50 per scan** (max 6.1 s) at the module's concurrency
of 6. The proposal's line was under 2 s p50. **Not met.**

Where the time goes, from timing every request inside two real batches:

- A scan makes about one request per title plus a few retries: photo 5's
  18 titles took 20 requests, photo 1's 15 titles took 15. Hits are one
  request each; the retry variants only run on a miss.
- A single request to Open Library's search takes 50 to 200 ms on its
  own. Inside a batch at concurrency 6 the same requests take 400 to 550 ms
  p50 and up to 2 s: the server serialises requests from one client, so
  throughput is about 6 requests per second whatever the concurrency
  (photo 5: 20 requests in 3.3 s at concurrency 6, 4.7 s at concurrency 1).
- A repeat of the same shelf is faster (photo 5: 6.1 s on the first run,
  3.3 s a few minutes later) because Open Library caches its own search
  results. The table above is the first run, the cold number a user
  would see.

So the lookup costs roughly 200 ms of catalogue time per title read,
regardless of how the requests are arranged. With 13 titles per scan the
floor at this catalogue is about 2.5 s, and the measured 4.5 s is the
cold-cache reality. Against the scoping budget (15 s p50 for the whole
scan, with the two model calls at about 10 s), verification fits, but it
uses most of the headroom.

## How we know it worked

| Question | Pass line | Measured | Result |
|---|---|---|---|
| Finds real books | at least 90 % of labelled titles resolve | 85.0 % of label-matched strings (277 / 326); 85.7 % on core | **not met** |
| Cheap in time | under 2 s p50 per scan | 4.5 s p50, 6.1 s max, cold | **not met** |
| Degrades | a scan completes with the catalogue stubbed as down | `tests/test_verify.py::test_catalogue_down_keeps_every_title_as_read_and_unverified` | passes |
| Nothing regressed | `research.check` passes | the check is unchanged by this task; no model rows were added | passes |

The two misses are both against the catalogue, not the wiring. Neither is
a reason not to ship verification: the drops it makes on a sharp photo
are real books the catalogue lacks, and the list the chooser gets is still
eleven titles, which is more than it needs to pick five. But they set the
work for 008 and for the next lookup change.

## What this suggests

**For 008 (caching).** The numbers the proposal asked for: about one
request per title, 200 ms of catalogue time per request under load, 63
distinct records across 25 scans of five distinct photos, and a derived
set that re-reads the same shelf five times. The 329 strings are 88
distinct (title, author) pairs, so a cache keyed on the normalised read
string would have answered about 3 of every 4 lookups on this set and
would take the 2 s line comfortably for a repeat shelf; a cold shelf still
pays the full cost. The `books` table alone does
not help, because the expensive part is the search, not the record.

**Four query-shape fixes** would recover most of the wrong drops without a
new catalogue:

1. When the part before a colon matches the read author, or the read
   author is glued to the front of the title, search the part *after* the
   colon or the title without the author's words ("Cody Cassidy: How to
   Survive History", "Soviel Economic Facts and Fallacies", "Schalk *
   Götter und Heldensagen").
2. Do not accept a one-word before-colon form at full score
   (`matching.similarity`'s D3 rule), or require the author to agree when
   the form is one word: fixes "Archie Brown", "Schalk", "Avatar".
3. Try the title alone before the title with author when the author was
   read off a spine, since a misread author costs two requests.
4. A second catalogue (Google Books) for a miss would cover the recent and
   self-published books; three of the eight real drops are 2023 to 2024
   titles.

**Author-only strings** (006's "Tom Clancy" bucket) were not resolved: the
module has no author search, and none of the 329 strings here was
author-only. Left as it is; the sourced set is where it would matter.
