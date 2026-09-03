-- Change 006: the test set grows beyond Marina's five photos. Each photo row
-- says which set it belongs to (core: her shelves with confirmed labels;
-- sourced: openly licensed shelf photos with agent-drafted labels; derived:
-- degraded copies of core photos), whether its labels are provisional, and
-- where a sourced photo came from (url, author, license, license_url, query)
-- so attribution can be rebuilt from the table alone.

alter table public.photos
  add column "set" text not null default 'core',
  add column provisional boolean not null default false,
  add column source jsonb;

alter table public.photos
  add constraint photos_set_check check ("set" in ('core', 'sourced', 'derived'));
