# Photo storage

How test-set photos and their labels get into Supabase, and how the photos
themselves are rebuilt on a fresh checkout.

## Files

- `data/photos/<stem>.jpg` — the local photo. Gitignored; photos may show
  private rooms.
- `data/labels/<stem>.json` — committed. Keys: `titles` (list of strings a
  person can read at full resolution), `partial` (fragments a reader who
  knows the book could still name), `notes` (free text on conditions).
- A photo's identity is its file stem. The object in the bucket is
  `<stem>.jpg` and that key is `storage_path` on the row.

### Sets (change 006)

Optional label keys say which set a photo belongs to:

- `set`: `core` (Marina's shelves, confirmed labels; the default when the
  key is absent), `sourced` (openly licensed shelf photos found online) or
  `derived` (a degraded copy of a core photo).
- `provisional`: true when the labels were drafted by an agent and not yet
  confirmed. Sourced photos start with empty `titles` and `partial` and
  `provisional: true`; labelling fills them in.
- `source` (sourced only): `{url, author, license, license_url, query}`.
  `url` is the file that `photos fetch` downloads; `query` is the search
  that found it. Only CC0, public domain and CC BY licences are accepted.
  `data/labels/SOURCES.md` lists every sourced photo with its attribution.
- `derived_from` (derived only): the stem of the original core photo.
  `titles`, `partial` and `notes` are copied from it.
- `degradation` (derived only): `{kind, params}` with kind one of `blur`
  (`radius` px), `glare` (`alpha`, `corner`), `rotate` (`degrees`) or
  `small` (`max_edge` px). Derived stems are `<original>__<kind>`.

## Commands

`uv run shelfscanner photos fetch [--force]`

Rebuilds `data/photos/` from the label files. Sourced photos are downloaded
from `source.url` and re-encoded as JPEG (PNG sources included). Derived
photos are regenerated from their local original with `images.degrade` and
the recorded `degradation`. Core photos cannot be fetched and are reported.
Existing files are kept unless `--force`. A failed download is reported and
does not stop the rest.

`uv run shelfscanner photos sync`

For every label file with a matching photo:

1. Apply the EXIF orientation to the pixels, then re-encode as JPEG at
   quality 95 with no EXIF and no XMP. The ICC profile is kept. Upload is
   refused if any metadata survives.
2. Upload to the private bucket `shelf-photos`, overwriting any existing
   object with the same key.
3. Upsert a `photos` row keyed on `storage_path` with `titles`,
   `partial_titles` and `notes` from the label file, plus `set`,
   `provisional` and `source` when the label file has them (absent keys
   leave the column defaults: `core`, false, null).

Photos without a label file are reported and skipped. Rerunning is
idempotent: ids are kept, objects are overwritten.

`uv run shelfscanner photos list` prints one line per row.

## Storage

- Bucket `shelf-photos`: private, JPEG and PNG only, 20 MiB per object.
  Nothing grants read access; the service key is the only reader.
- Table `photos`: `id` (identity), `storage_path` (unique), `titles`,
  `partial_titles` (text arrays), `notes`, `created_at`, `set` (text,
  default `core`, checked against `core`/`sourced`/`derived`),
  `provisional` (boolean, default false), `source` (jsonb, null unless
  sourced). RLS enabled, no policies; only `service_role` has data
  privileges.
