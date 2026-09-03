-- Change 003: device sessions and the photos a session scans.
-- See docs/changes/003-app-shell/proposal.md and the "Sessions" contract in
-- docs/changes/README.md. The cookie holds a random token; only its SHA-256
-- hex is stored, so a copy of this table cannot impersonate a device.

create table public.sessions (
  id            bigint generated always as identity primary key,
  token_hash    text not null unique,                 -- sha256 hex of the cookie token
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now()
);

alter table public.sessions enable row level security;

-- A real scan's photo belongs to a session; test-set photos keep a null
-- session and their labels. Deleting a session deletes its photos (they may
-- show a private room); the bucket objects are cleaned up by the retention
-- job in change 008.
alter table public.photos
  add column session_id bigint references public.sessions (id) on delete cascade;

create index photos_session_id_idx on public.photos (session_id);

-- Grants as before (20260902000001): only the service role touches rows.
grant select, insert, update, delete on public.sessions to service_role;
revoke all on public.sessions from anon, authenticated;
