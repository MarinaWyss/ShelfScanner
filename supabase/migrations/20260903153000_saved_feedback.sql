-- Change 005: a save and a "not for me" per pick, each tied to the recommendation row that
-- produced the pick (docs/specs/feedback.md; scoping F1, F2; proposal D1).
--
-- Both tables reference the recommendation row and the pick's position in its
-- `parsed_recommendations`, so a save joins to the model, prompt version and preferences behind
-- it. `saved` is a history, not a flag: saving again after an unsave inserts a new row, and an
-- unsave stamps `removed_at` on the latest live row rather than deleting it. A pick is "saved"
-- while it has a row with `removed_at` null. `feedback` rows are only ever added.
--
-- Same access model as every other table: RLS on, no policies, service_role only.

create table public.saved (
  id                 bigint generated always as identity primary key,
  session_id         bigint not null references public.sessions (id) on delete cascade,
  recommendation_id  bigint not null references public.recommendations (id) on delete cascade,
  pick_index         smallint not null check (pick_index >= 0),
  created_at         timestamptz not null default now(),
  removed_at         timestamptz
);

create index saved_session_recommendation_idx on public.saved (session_id, recommendation_id);

create table public.feedback (
  id                 bigint generated always as identity primary key,
  session_id         bigint not null references public.sessions (id) on delete cascade,
  recommendation_id  bigint not null references public.recommendations (id) on delete cascade,
  pick_index         smallint not null check (pick_index >= 0),
  kind               text not null check (kind in ('not_for_me')),
  created_at         timestamptz not null default now()
);

create index feedback_session_recommendation_idx on public.feedback (session_id, recommendation_id);

alter table public.saved enable row level security;
alter table public.feedback enable row level security;

grant select, insert, update, delete on public.saved, public.feedback to service_role;
grant usage, select on all sequences in schema public to service_role;

revoke all on public.saved, public.feedback from anon, authenticated;
