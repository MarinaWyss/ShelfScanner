-- Change 004: reading preferences, one object per session (docs/specs/preferences.md).
--
-- `object` is the preferences object as the prompt consumes it: genres, free_text, rated_books,
-- to_read, avoid. The Goodreads export it was built from is never stored (scoping R4). The row is
-- replaced on re-import. `sessions` comes from change 003's migration, which sorts before this one.
--
-- Same access model as the other tables: RLS on, no policies, service_role only.

create table public.preferences (
  session_id  bigint primary key references public.sessions (id) on delete cascade,
  object      jsonb not null,
  updated_at  timestamptz not null default now()
);

alter table public.preferences enable row level security;

grant select, insert, update, delete on public.preferences to service_role;

revoke all on public.preferences from anon, authenticated;
