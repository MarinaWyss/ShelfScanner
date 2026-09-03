-- Change 007: catalogue records found for titles read off a shelf, and one row
-- of lookup counts per scan. See docs/changes/007-book-lookup/proposal.md
-- (D1 Open Library first, D2 an unavailable catalogue never fails a scan) and
-- the "Book records" contract in docs/changes/README.md.
--
-- Same access model as the earlier tables: RLS on with no policies, data
-- privileges for service_role only, and the public roles stripped.

-- ---------------------------------------------------------------------------
-- books: one row per catalogue record, keyed by the catalogue's own id. Whether
-- the lookup reads this table before calling out is decided in 008.
-- ---------------------------------------------------------------------------
create table public.books (
  id            bigint generated always as identity primary key,
  catalogue     text not null,                -- 'openlibrary'
  catalogue_id  text not null,                -- the catalogue's work id, e.g. OL27448W
  title         text not null,                -- canonical title as the catalogue has it
  author        text,                         -- up to three names, comma separated; null when unknown
  first_year    integer,                      -- first publication year
  cover_id      text,                         -- catalogue cover id; null when it has no cover
  fetched_at    timestamptz not null default now(),
  unique (catalogue, catalogue_id)
);

alter table public.books enable row level security;

-- ---------------------------------------------------------------------------
-- lookups: one row per scan with the counts the report needs. errors are
-- catalogue failures (transport, timeout, non-200); they are also counted in
-- misses, so hits + misses is the number of titles looked up.
-- ---------------------------------------------------------------------------
create table public.lookups (
  id          bigint generated always as identity primary key,
  photo_id    bigint not null references public.photos (id) on delete cascade,
  hits        integer not null default 0,
  misses      integer not null default 0,
  errors      integer not null default 0,
  latency_ms  integer,                        -- wall time for the whole shelf, requests in parallel
  created_at  timestamptz not null default now()
);

create index lookups_photo_id_idx on public.lookups (photo_id);

alter table public.lookups enable row level security;

-- ---------------------------------------------------------------------------
-- Grants, as in 20260902000001_service_role_grants.sql.
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.books, public.lookups to service_role;

grant usage, select on all sequences in schema public to service_role;

revoke all on public.books, public.lookups from anon, authenticated;
