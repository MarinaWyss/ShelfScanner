# Book lookup

Status: wired as verification between extraction and recommendation
(change 007, per 006's decision). `src/shelfscanner/lookup.py` resolves a
title read off a shelf to an Open Library work record;
`src/shelfscanner/verify.py` runs it over a whole extraction and decides
what the chooser sees. Measured numbers are in
`docs/changes/archive/007-book-lookup/results.md`; the cache's (change
008, task 4) in `docs/changes/008-hardening/results.md`.

## Where it runs

`shelfscanner run` extracts, verifies, then recommends from the verified
list; `--no-verify` skips the middle step. `research.matrix llm --verify`
does the same for a comparison run and is off by default, so comparison
rows stay like for like with earlier ones. The web scan (`web.md`) does
not run it yet; when it does, it belongs in the same place, after a
successful extraction and before the recommendation, and
`verify_extraction`'s `on_progress` reports `checking titles`.

`verify.verify_extraction(extraction, *, client=None, db=None,
on_progress=None, concurrency=6) -> Verified` takes an `extractions` row.
`client` is the catalogue transport and `db` the Supabase client; both
default to the real ones and both are replaced in tests. The lookup cache
(below) lives on `db`, so verification reads and writes it through the
same handle.

## What verification does

Every `{title, author}` the extraction read (empty titles skipped) is
looked up with `lookup_batch`. Then, in the extraction's order:

- A title with a record at the threshold is **kept** under the record's
  canonical title and author (the read author when the record has none),
  with the record and its score, `verified = True`. A fragment or a
  misspelling that reaches the threshold is a title found: "Americn Gods"
  is kept as "American Gods".
- A title the catalogue answered for with no record at the threshold is
  **dropped**, reason `no record at the threshold`, with the nearest
  candidate under the threshold (catalogue title, score) when there was
  one (a miss answered from the cache carries none). The drop is logged
  at info level under `shelfscanner.verify`.
- A second title resolving to a record already kept is **dropped** with
  reason `same record as an earlier title`; the list the chooser sees has
  each record once.
- A title whose lookup **failed** (transport, timeout, non-200, malformed
  reply) is kept as read, `verified = False`, record `None`. The scan goes
  on (007 D2). When every lookup failed, `Verified.catalogue_down` is true
  and a warning is logged; the whole list goes through unverified.

`Verified` holds `photo_id`, `extraction_id`, `kept` (list of `Kept`:
`title`, `author`, `read_title`, `read_author`, `record`, `score`,
`verified`), `dropped` (list of `Dropped`: `title`, `author`, `reason`,
`nearest`), the batch's `hits`, `misses` (errors included), `errors`,
`latency_ms`, and `lookup_id`. `line()` is the one-line summary the CLI
prints; `lines()` adds one line per drop.

Author-only strings (a name in the title field) are not resolved by an
author search; the module has none. They are looked up as titles and, in
practice, dropped.

## What the chooser sees

`recommend.recommend_from_extraction(..., verified=)` with a `Verified`
hands the model the kept titles with their canonical author, runs the R1
validity check against that list, and stores each pick with `verified`,
`catalogue_id` and `cover_id` (see `recommendation.md`). When every title
was dropped the recommendation is not attempted (`SystemExit`). Without
`verified=` the function behaves as before 007.

## Lookup

`lookup(title, author) -> Match | None` returns the best catalogue record
for one title, or None when nothing matches or the catalogue could not be
reached. `Match` holds `record` and `score`; `BookRecord` holds
`catalogue` (`"openlibrary"`), `catalogue_id` (the work id, e.g.
`OL679360W`), `title` (as the catalogue has it), `author` (up to three
names, comma separated, or None), `first_year` and `cover_id` (or None).
The cover image is `https://covers.openlibrary.org/b/id/<cover_id>-M.jpg`.

`lookup_many(items)` does the same for a list of `(title, author)` pairs,
in the same order, with at most `concurrency` (default 6) requests in
flight. `lookup_batch(items)` returns the same list plus the counts the
`lookups` row records (`hits`, `misses`, `errors`, `latency_ms`, wall time
for the whole list, and `cache_hits`, the titles the cache answered) and,
per item in the same order, `item_errors` (the error string or None) and
`nearest` (the best candidate under the threshold, or None). It takes
`cache=` (a `CacheStore`; None means no cache, the 007 behaviour);
`verify_extraction` passes `cache_for(db)`.

## Queries

One GET to `https://openlibrary.org/search.json` per query with `title=`,
`author=` when one was read, `fields=key,title,author_name,first_publish_year,cover_i`
and `limit=5`, sent with a `User-Agent` naming this project. The
queries for one title are tried in order until one finds a record: the
title as read with the author, the part before a colon with the author,
then both without the author. Duplicates are dropped, so a title with no
subtitle and no author is one request; a true miss with both is four.

The main-title retry exists because Open Library's title search needs
every word of the query in the record's title, and subtitles are often
not there. The author-less retry exists because a misread author would
otherwise hide a real book.

Measured (007 results): a shelf of 13 titles makes about 15 requests;
Open Library serves about 6 requests per second to one client whatever
the concurrency, so a cold scan costs 4.5 s p50 and up to 6 s. With the
cache (008 results) a repeated shelf makes no request and verifies in
about 0.1 s, most of it the `books` upsert.

## Scoring

Each candidate is scored against the title and author as read, not the
query that found it. The score is `matching.similarity(read_title,
catalogue_title)`, plus 0.10 when the read author matches one of the
catalogue's authors (sequence ratio of at least 0.8 on the normalised
names, or a shared surname of three or more letters), capped at 1.0.
The best candidate at or above the config's `match_threshold` wins; on a
tie the catalogue's own relevance order decides. No candidate over the
threshold is a miss.

Known limitation: `similarity` accepts the part before a colon as a form
of the title, so a one-word main title matches any record with that word
at 1.0 ("Archie Brown: The Rise and Fall of Communism" resolves to
"Archie Brown" by Linden Carter). Verification passes such a title;
enrichment would show the wrong record.

## Cache

Before anything is sent to the catalogue, `lookup_batch` asks the store
for every pair in the batch in one read (`CacheStore.read(keys)`), and
after the catalogue has answered it writes every new answer back in one
write (`CacheStore.write(entries)`). Nothing is read or written per
title.

The key is `cache_key(title, author)`: `matching.normalise(title)`, the
separator `|`, and `normalise(author)` (empty when no author was read).
`normalise` lowercases, strips accents and punctuation and drops a
leading or trailing article, so "Schalk: Götter und Heldensagen" and
"Schalk – Gotter und Heldensagen" share a row; an empty title has no key
and is never cached. The same title read with and without an author is
two keys.

A cache row says what the catalogue answered for the pair and when:

- **A record** (`catalogue_id` set): resolved from `books` without a
  network call, scored against the pair as read with the same arithmetic
  as a live candidate (`record_score`). Records do not expire. If the
  `books` row has gone, the pair is asked again.
- **A miss** (`catalogue_id` null): returned as a miss without a call
  while younger than `MISS_TTL` (30 days); older, the catalogue is asked
  again, so a newly catalogued book is found. A cached miss has no
  `nearest` candidate.
- **An error** is never cached: a title whose lookup failed is asked
  again on the next scan.

Everything the cache did not answer goes to the catalogue as before, in
the same pool, and is written back: `books` rows first (so the cache's
foreign key holds), then cache rows. `Batch.cache_hits` counts the titles
answered from the cache, record or fresh miss alike; the `lookups` row
stores it and `Verified.line()` shows it as `cached n/total`.

Two stores implement `CacheStore`. `SupabaseCache` (built by
`cache_for(db)`) is two selects to read (the cache rows for the keys,
then the `books` rows they point at; none when every row is a miss) and
two upserts to write. `MemoryCache` is a dict, for tests and for
measuring before a migration is pushed. A store failure of any kind,
read or write, is logged at warning level under `shelfscanner.lookup`
and the batch runs cold with nothing written back; it never fails a scan
(the same rule as a catalogue failure, 007 D2).

## Failure

A transport error, timeout (default 4 s per request), non-200 status or
a reply that is not JSON of the expected shape gives None for that title,
is logged at warning level under `shelfscanner.lookup`, and is counted in
`Batch.errors` as well as `misses`. Nothing is raised; verification keeps
the title unverified and the scan continues (007 D2).

## Tables

Migrations `20260903003853_books.sql` and `20260903160000_lookup_cache.sql`.

- `books`: `id` (identity), `catalogue`, `catalogue_id`, `title`,
  `author`, `first_year`, `cover_id`, `fetched_at`. Unique on
  `(catalogue, catalogue_id)`. Verification upserts every record it kept,
  one row per distinct record, refreshing `fetched_at`.
- `lookups`: one row per verification, `photo_id` (references `photos`,
  cascade), `hits`, `misses` (errors included, so `hits + misses` is the
  number of titles looked up), `errors`, `latency_ms`, `cache_hits`
  (titles the cache answered; the hit rate is `cache_hits / (hits +
  misses)`), `created_at`. A row is written even when the extraction read
  nothing.
- `lookup_cache`: one row per normalised pair, `key` (primary key, see
  "Cache"), `catalogue`, `catalogue_id` (null records a miss),
  `fetched_at`. `(catalogue, catalogue_id)` references `books` with
  cascade, so a cached record always has a book row to resolve from and
  deleting a book row drops the cache rows pointing at it.

All three: RLS enabled with no policies; only `service_role` has data
privileges.

## Tests

`tests/test_lookup.py` runs against recorded replies in
`tests/fixtures/openlibrary_*.json` (each file holds the request params,
the status and the body, recorded 2026-09-02) through a stubbed client.
`tests/test_verify.py` runs verification over the same fixtures with a
stubbed catalogue and a fake database: all found, some dropped, catalogue
down, one failed lookup among good ones, misspelling and fragment
resolved to the canonical title, duplicate records, and the pick
annotation. `tests/test_lookup_cache.py` runs the cache over a stubbed
catalogue and an in-memory store (all cached, a fresh miss, an expired
miss, a hit whose book row is gone, a cold batch's rows, an error not
cached, `cache_hits`, an unavailable store) and the Supabase store over a
fake client that answers its selects and upserts. No test touches the
network.
