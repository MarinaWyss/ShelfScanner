-- Change 008, task 3: photo retention (proposal D2).
--
-- The retention job deletes the bucket object for unlabelled photos older
-- than the window and keeps the row for the metrics. A row whose object is
-- gone has a null `storage_path` and a `photo_deleted_at` timestamp; the
-- check constraint is the invariant that one implies the other. The unique
-- constraint stays: nulls are distinct, so any number of deleted rows fit,
-- and `photos sync` still upserts labelled rows on `storage_path`.

alter table public.photos
  alter column storage_path drop not null,
  add column photo_deleted_at timestamptz,
  add constraint photos_storage_path_or_deleted
    check (storage_path is not null or photo_deleted_at is not null);

comment on column public.photos.photo_deleted_at is
  'When the retention job removed the bucket object; null while the object exists.';
