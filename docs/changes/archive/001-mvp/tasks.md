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

## 3. Photo sync — done 2026-09-02

- Storage module: strip EXIF (the phone embeds GPS), upload the file to the
  bucket, upsert a `photos` row from a label file, list photos.
- `photos sync` command wired into the existing `shelfscanner` entry point.
- `.env.example` updated for anything new. No provider keys yet.

Done when: `uv run shelfscanner photos sync` uploads the test set and the
`photos` table shows one row per photo with its titles.

Notes: `pillow` added here rather than in task 4, since stripping metadata
needs it. Stripping re-encodes at JPEG quality 95 after applying the EXIF
orientation to the pixels, drops EXIF and XMP, keeps the ICC profile. All
five source photos carried a GPS block. Verified: remote copies have no
metadata, unauthenticated fetch of the bucket returns 404, rerunning sync is
idempotent (same ids, five rows). `photos list` added as a convenience. No
new environment variables. `pytest` added as a dev dependency with
`tests/test_images.py` covering the stripping on an in-memory fixture, so
the privacy check does not depend on the gitignored photos.

## 4. Model config and the OpenRouter adapter — done 2026-09-02

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

Notes: five candidates, not four; Qwen 3.8 Flash added at Marina's request
and recorded in proposal D10. "Current small model" resolved to gpt-5.4-mini
and "current Flash" to gemini-3.8-flash, both newer and pricier than the
proposal's orientation prices. All five returned parsed JSON for photo 4 at
1568px with usage, cost and upstream provider. Findings from the throwaway
calls: OpenRouter routes Anthropic models to Amazon Bedrock or Claude
Platform on AWS, logged per call as designed. Gemini 3.8 Flash spends
thousands of reasoning tokens inside `max_tokens` (about 4,000 on a 12-book
shelf, 39 s, $0.016, dearer than Sonnet); at a 1,024 cap it truncated before
the JSON. The adapter records `finish_reason` and `reasoning_tokens` and
reports a truncated reply as truncation, not a parse failure, so the two are
distinguishable in the log. A reasoning-effort setting per model may be
worth adding before the matrix in task 8. Tests cover config loading,
model lookup, JSON fence tolerance, and resize geometry.

## 5. Extraction end to end — done 2026-09-02

- `prompts/extract_v1.md`.
- Matching and metrics module: normalisation, fuzzy match, found / missed /
  invented against a photo's labels (proposal D3, D4).
- Unit tests for the matching module: normalisation cases ("Hobbit, The",
  subtitles, punctuation), the threshold edge, and partial-label exclusion.
  These are pure functions and a wrong metric silently corrupts the whole
  comparison.
- `extract` command: fetch photo from bucket, resize, call adapter, score,
  write an `extractions` row including cost computed from the config prices.
  Errors and parse failures are logged as rows with the error field set.

Done when: `extract --photo all --model <haiku slug>` produces one row per
photo and the metrics look sane when spot-checked against two photos by hand.

Notes: cost is logged as reported by OpenRouter (D13), not recomputed from
config prices; tokens are logged so it can be. Spot-check of photos 1 and 4
found the matcher right on every invented title except one, where Haiku put
the author into the title field; D3 was amended to accept a title that
contains the whole label, and rows 1–5 were rescored in place. Haiku 4.5 at
1568px on extract_v1: median recall 0.42, 33 invented titles over five
photos, about $0.0036 and 4.6 s per photo. That is far below the pass line
and is a real finding, not a scoring artefact: it misreads Fraktur and faded
spines, invents plausible titles ("The Alchemist"), and returns a series
name for a volume. The other candidates run in task 8.

## 6. Recommendation end to end — done 2026-09-02

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

Notes: `data/prefs/marina.json` was drafted by Claude from what the shelves
show, then edited by Marina before commit. A `_note` key, if present, is
stripped before sending.
The model is given the extraction's titles with authors where it supplied
them, plus the preferences as JSON. Validity uses the same fuzzy matcher as
extraction so a case or subtitle difference does not fail the hard
constraint. A reply with the wrong number of recommendations is logged with
the error field set. First run on photo 4, Haiku both stages: 5/5 valid
against the extraction, 2/5 against labels, $0.0057 and 8.6 s for both
stages. The two invalid picks were hallucinated extractions ("The Expanse",
"A Wizard's Guide"), which is precisely what D5's second count is for. Haiku
also took "North and South" for the Gaskell novel rather than the Avatar
volume, which the specificity rubric in task 7 should catch.

## 7. Scoring and reporting — done 2026-09-02

- `score` command writing specificity scores onto a recommendation row.
- Migration adding a check constraint that every `specificity_scores`
  element is 1, 2 or 3, so a typo cannot skew the report (proposal D6).
- `report` command: per model, for extraction: photo count, median recall,
  mean invented per photo, p50 latency, mean cost. For recommendation: run
  count, share valid against extraction, share valid against ground truth,
  mean specificity, p50 latency, mean cost.

Done when: `report` prints both tables from whatever rows exist.

Notes: extraction aggregates are grouped by model and image long edge, so
task 8's larger-size run shows as its own row. Validity shares are over all
recommended titles, not per run. `score` rejects a wrong count or a value
outside 1–3 before writing; the migration adds the same range check in the
database. Recommendation 1 was scored 2 3 1 1 2 by Claude to exercise the
command; Marina can overwrite it by running `score` again. Aggregation is
tested on hand-built rows.

## 8. Run the matrix and decide — done 2026-09-02

- Every vision candidate over every photo at the default image size; the best
  candidate again at one larger size.
- Every language candidate over the best extraction of each photo, scored by
  hand for specificity.
- Results and the pass/fail against the proposal's criteria written to
  `docs/changes/001-mvp/results.md`.
- A visual report (added 2026-09-02 at Marina's request) showing what was
  tested and each model's extraction quality, cost and latency, and
  separately its recommendation quality, since the vision and language
  model will likely be chosen independently. Generated from the logged rows
  by `report --html <file>` so it can be regenerated after hand scoring.
- `docs/specs/` gets one file per capability now true (photo storage,
  extraction, recommendation, run logging). Scoping doc sections 2 and 3
  tables filled in from the results. README gets setup instructions.
- A one-paragraph note on which provider won and that the next change
  replaces the OpenRouter adapter with that provider's SDK.
- Change folder moved to `docs/changes/archive/`.

Done when: results.md answers the two questions in the proposal with numbers,
and the specs describe what the script does today.

Notes: matrix complete, 68 calls, about $0.38 in total. Both questions
answered yes (results.md). Sonnet 5 was run at 2400 px as the best
candidate; same aggregate as 1568. Qwen needed a per-model reasoning
setting (`reasoning_effort` in config, passed as OpenRouter's
`reasoning.effort`) because its default thinking consumed the output
budget; that is a small adapter extension beyond task 4. Report grouping
now takes the latest row per photo (or per extraction) within a model so
reruns supersede, with error rows still counted. Specs written, scoping
sections 2 and 3 filled, README written, report.html generated and
published. Specificity scoring was replaced by overlap with Marina's own
picks per photo (D6 amended); picks live in `data/prefs/marina_picks.json`
and overlap is computed when the report is built, with no schema change.
Photo 4's "any Avatar volume" is a grouped pick; photo 5 has every book
approved and so carries no signal for stage two.
