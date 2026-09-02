# 001 — Tasks

Work in order. Stop after each for review. Each task ends with something that
can be run or inspected.

## 1. Build the test set — done 2026-09-02

- Five shelf photos in `data/photos/` (gitignored).
- For each photo, a `data/labels/<photo-stem>.json` with `titles`, `partial`
  (both lists of strings, per proposal D2) and `notes` (free text on angle,
  light, occlusion, and what was left unlabelled).
- Labels drafted by Claude from the photos, confirmed by Marina.

## 2. Supabase schema and bucket — done 2026-09-02

- Migration in `supabase/migrations/` creating `photos`, `extractions`,
  `recommendations` per the proposal, with RLS enabled and no policies.
- Private bucket `shelf-photos`, created in the same migration if the CLI
  supports it, otherwise documented as a one-time manual step.
- Push to the linked project.

Done when: tables and bucket exist remotely and `supabase db diff` is clean.

Notes: bucket created by SQL insert in the migration, no manual step. Ids are
identity bigints so CLI flags stay typeable. `db diff` needs Docker, which was
not running; `migration list --linked` shows local and remote in sync instead.
The project does not auto-grant new tables to the Data API roles, so a second
migration grants DML to `service_role` only and revokes the public roles'
leftover privileges. Verified with the Python client: all three tables and the
bucket are reachable with the service key.

## 3. Photo sync

- Storage module: strip EXIF (the phone embeds GPS), upload the file to the
  bucket, upsert a `photos` row from a label file, list photos.
- `photos sync` command wired into the existing `shelfscanner` entry point.
- `.env.example` updated for anything new. No provider keys yet.

Done when: `uv run shelfscanner photos sync` uploads the test set and the
`photos` table shows one row per photo with its titles.

## 4. Model config and the OpenRouter adapter

- Config file listing candidate models by OpenRouter slug, with the provider
  name and the direct price for reference, plus match threshold and default
  max image edge. Slugs verified against OpenRouter's model list and the date
  checked recorded.
- Adapter: given an image (or text) and a prompt file, POST to OpenRouter via
  `httpx` with usage accounting on; return raw text, parsed JSON, token
  counts, reported cost, upstream provider, latency.
- `httpx` and `pillow` added to dependencies; `OPENROUTER_API_KEY` in
  `.env.example`.
- Image resize helper with the long-edge flag.

Done when: a throwaway call from the REPL returns parsed JSON for one resized
photo from each of the four candidate slugs, with usage and cost.

## 5. Extraction end to end

- `prompts/extract_v1.md`.
- Matching and metrics module: normalisation, fuzzy match, found / missed /
  invented against a photo's labels (proposal D3, D4).
- `extract` command: fetch photo from bucket, resize, call adapter, score,
  write an `extractions` row including cost computed from the config prices.
  Errors and parse failures are logged as rows with the error field set.

Done when: `extract --photo all --model <haiku slug>` produces one row per
photo and the metrics look sane when spot-checked against two photos by hand.

## 6. Recommendation end to end

- `prompts/recommend_v1.md`.
- `data/prefs/marina.json`: genres, free-text likes, a few loved books, a
  few things to avoid.
- `recommend` command: load extraction, load prefs, call adapter, check every
  recommendation against the extraction's titles and against ground truth
  (proposal D5), write a `recommendations` row.
- `run` command chaining both stages for a photo.

Done when: `run --photo <id> --vision-model <haiku slug> --llm-model
<haiku slug> --prefs data/prefs/marina.json` writes both rows and prints
five titles with reasons.

## 7. Scoring and reporting

- `score` command writing specificity scores onto a recommendation row.
- `report` command: per model, for extraction: photo count, median recall,
  mean invented per photo, p50 latency, mean cost. For recommendation: run
  count, share valid against extraction, share valid against ground truth,
  mean specificity, p50 latency, mean cost.

Done when: `report` prints both tables from whatever rows exist.

## 8. Run the matrix and decide

- Every vision candidate over every photo at the default image size; the best
  candidate again at one larger size.
- Every language candidate over the best extraction of each photo, scored by
  hand for specificity.
- Results and the pass/fail against the proposal's criteria written to
  `docs/changes/001-mvp/results.md`.
- `docs/specs/` gets one file per capability now true (photo storage,
  extraction, recommendation, run logging). Scoping doc sections 2 and 3
  tables filled in from the results. README gets setup instructions.
- A one-paragraph note on which provider won and that the next change
  replaces the OpenRouter adapter with that provider's SDK.
- Change folder moved to `docs/changes/archive/`.

Done when: results.md answers the two questions in the proposal with numbers,
and the specs describe what the script does today.
