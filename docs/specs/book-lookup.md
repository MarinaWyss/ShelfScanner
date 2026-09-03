# Book lookup

Status: module exists, not yet wired. `src/shelfscanner/lookup.py` resolves
a title read off a shelf to an Open Library work record. Nothing in the
pipeline calls it yet; 007 task 3 decides where it runs.

## What it does

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
`lookups` row records: `hits`, `misses`, `errors` and `latency_ms` (wall
time for the whole list).

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

## Scoring

Each candidate is scored against the title and author as read, not the
query that found it. The score is `matching.similarity(read_title,
catalogue_title)`, plus 0.10 when the read author matches one of the
catalogue's authors (sequence ratio of at least 0.8 on the normalised
names, or a shared surname of three or more letters), capped at 1.0.
The best candidate at or above the config's `match_threshold` wins; on a
tie the catalogue's own relevance order decides. No candidate over the
threshold is a miss.

## Failure

A transport error, timeout (default 4 s per request), non-200 status or
a reply that is not JSON of the expected shape gives None for that title,
is logged at warning level under `shelfscanner.lookup`, and is counted in
`Batch.errors` as well as `misses`. Nothing is raised; the scan continues
without the record (007 D2).

## Tables

Migration `20260903003853_books.sql`.

- `books`: `id` (identity), `catalogue`, `catalogue_id`, `title`,
  `author`, `first_year`, `cover_id`, `fetched_at`. Unique on
  `(catalogue, catalogue_id)`. Not yet written to.
- `lookups`: one row per scan, `photo_id` (references `photos`, cascade),
  `hits`, `misses`, `errors`, `latency_ms`, `created_at`. Not yet written to.

Both: RLS enabled with no policies; only `service_role` has data
privileges.

## Tests

`tests/test_lookup.py` runs against recorded replies in
`tests/fixtures/openlibrary_*.json` (each file holds the request params,
the status and the body, recorded 2026-09-02) through a stubbed client.
No test touches the network.
