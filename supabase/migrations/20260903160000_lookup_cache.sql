-- Change 008, task 4: the lookup cache (proposal D3: caching decided by 007's numbers;
-- 4.5 s p50 against the 3 s line, 329 read strings were 88 distinct pairs).
-- See docs/specs/book-lookup.md, "Cache".
--
-- One row per normalised (title, author) pair read off a shelf: what the catalogue
-- answered, and when. A null catalogue_id records a miss; the lookup re-asks the
-- catalogue for a miss older than thirty days so a newly catalogued book is found.
-- A hit resolves from `books` without a network call, so the pair references the
-- book row it points at and disappears with it.
--
-- The key is the natural key and the only way the table is read, so it is the
-- primary key (a surrogate id would add an index nobody uses).
--
-- Same access model as every other table: RLS on, no policies, service_role only.

create table public.lookup_cache (
  key           text primary key,             -- normalise(title) || '|' || normalise(author), '' when no author
  catalogue     text not null,                -- 'openlibrary'
  catalogue_id  text,                         -- the catalogue's work id; null records a miss
  fetched_at    timestamptz not null default now(),
  foreign key (catalogue, catalogue_id) references public.books (catalogue, catalogue_id) on delete cascade
);

create index lookup_cache_catalogue_id_idx on public.lookup_cache (catalogue, catalogue_id);

alter table public.lookup_cache enable row level security;

-- How many of the scan's titles the cache answered (a record or a fresh miss) without a catalogue call.
alter table public.lookups add column cache_hits integer not null default 0;

grant select, insert, update, delete on public.lookup_cache to service_role;

revoke all on public.lookup_cache from anon, authenticated;
