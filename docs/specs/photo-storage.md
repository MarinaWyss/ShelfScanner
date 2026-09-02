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

## Storage

- Bucket `shelf-photos`: private, JPEG and PNG only, 20 MiB per object.
  Nothing grants read access; the service key is the only reader.
- Table `photos`: `id` (identity), `storage_path` (unique), `titles`,
  `partial_titles` (text arrays), `notes`, `created_at`. RLS enabled, no
  policies; only `service_role` has data privileges.
