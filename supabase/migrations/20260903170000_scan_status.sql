-- Change 008, task 2: the scan's status as the lock on its stages, and the browser-resize fallback.
--
-- `status` says what is happening to a session photo's scan: `pending` (stored, nothing running),
-- `reading` or `choosing` (that stage is claimed by one connection), `done`, `failed`. A second
-- connection to /scan/{id}/events while a stage is in flight sees the claim and waits instead of
-- running the model again (003 W1's open issue). `status_at` is when the status was set; a
-- `reading` or `choosing` claim older than three minutes is stale and may be retried. Test-set
-- photos (no session) keep the default and never use it.
--
-- `resized_by_client` records the `resized` form field: true when the browser shrank the photo
-- before sending it, false when the server had to (003's fallback rate, previously only logged),
-- null for photos that did not arrive through the web form.

alter table public.photos
  add column status text not null default 'pending',
  add column status_at timestamptz not null default now(),
  add column resized_by_client boolean;

alter table public.photos
  add constraint photos_status_check check (status in ('pending', 'reading', 'choosing', 'done', 'failed'));

comment on column public.photos.status is
  'Scan state and stage lock: pending, reading, choosing, done, failed. Only meaningful for session photos.';
comment on column public.photos.status_at is
  'When status was last set; a reading or choosing claim older than three minutes is stale.';
comment on column public.photos.resized_by_client is
  'True when the browser resized the upload, false when the server did; null outside the web form.';
