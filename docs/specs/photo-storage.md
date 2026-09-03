# Photo storage

How test-set photos and their labels get into Supabase.

## Files

- `data/photos/<stem>.jpg` — the local photo. Gitignored; photos may show
  private rooms.
- `data/labels/<stem>.json` — committed. Keys: `titles` (list of strings a
  person can read at full resolution), `partial` (fragments a reader who
  knows the book could still name), `notes` (free text on conditions).
- A photo's identity is its file stem. The object in the bucket is
  `<stem>.jpg` and that key is `storage_path` on the row.

## Command

`uv run shelfscanner photos sync`

For every label file with a matching photo:

1. Apply the EXIF orientation to the pixels, then re-encode as JPEG at
   quality 95 with no EXIF and no XMP. The ICC profile is kept. Upload is
   refused if any metadata survives.
2. Upload to the private bucket `shelf-photos`, overwriting any existing
   object with the same key.
3. Upsert a `photos` row keyed on `storage_path` with `titles`,
   `partial_titles` and `notes` from the label file.

Photos without a label file are reported and skipped. Rerunning is
idempotent: ids are kept, objects are overwritten.

`uv run shelfscanner photos list` prints one line per row.

## Retention

Photos that are not part of the test set are kept for a window, then the
object is deleted and the row stays for the metrics.

`uv run shelfscanner photos retain [--dry-run] [--days N]`

1. The window is `SHELFSCANNER_RETENTION_DAYS` from the environment or
   `.env`, default 30; `--days` overrides it. Rows are aged by `created_at`.
2. A row is a candidate when it still has a `storage_path`, is older than
   the window, and is not exempt. A row is exempt, and never touched, when
   its `titles` array is non-empty or its `set` column (once it exists) is
   anything other than the default `core`. The exemption is asked of the
   server and re-checked on every returned row before deletion.
3. For each candidate the object is removed from `shelf-photos`, then the
   row's `storage_path` is set to null and `photo_deleted_at` to the run's
   time. Removing a key that is already gone is not an error, so a run
   interrupted between the two steps is repaired by the next one.
4. One failed deletion is reported and does not stop the others; the
   command exits non-zero if any failed. `--dry-run` lists the candidates
   and changes nothing.

The job runs daily from `.github/workflows/retention.yml` (also on manual
dispatch, with a dry-run option) with `SUPABASE_URL` and
`SUPABASE_SECRET_KEY` from repository secrets and an optional
`SHELFSCANNER_RETENTION_DAYS` repository variable. Deployment (010) moves it
to Vercel cron.

## Storage

- Bucket `shelf-photos`: private, JPEG and PNG only, 20 MiB per object.
  Nothing grants read access; the service key is the only reader.
- Table `photos`: `id` (identity), `storage_path` (unique; null once
  retention has removed the object), `titles`, `partial_titles` (text
  arrays), `notes`, `created_at`, `photo_deleted_at` (when retention removed
  the object). A row has a `storage_path` or a `photo_deleted_at`, enforced
  by a check constraint. RLS enabled, no policies; only `service_role` has
  data privileges.
