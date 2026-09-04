-- Change 017, D1: a second scan limit keyed on the client address. The photo row
-- carries a SHA-256 of the address the upload came from (the first value of
-- x-forwarded-for on Vercel, the socket peer on the laptop), so the limit is a
-- count over the last hour like the per-device one. Null for test-set photos and
-- for every photo stored before this change; the retention job nulls it in the
-- same update that removes the object, so the hash lives as long as the photo.

alter table public.photos
  add column client_hash text;

comment on column public.photos.client_hash is
  'SHA-256 hex of the uploading client''s network address (017 D1); null for test-set photos and once retention has removed the object.';
