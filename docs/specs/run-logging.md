# Run logging and reporting

Every model call produces a row in Supabase; the report reads them back.

## Where rows live

Project `ShelfScanner` (linked via the Supabase CLI). Tables `photos`,
`extractions`, `recommendations`, defined in `supabase/migrations/`. RLS is
enabled on all three with no policies; only `service_role` has data
privileges, and the script uses the service key from `.env`.

Every extraction and recommendation row records the model slug, the
prompt filename, the upstream provider OpenRouter routed to, tokens,
OpenRouter's reported cost, latency and any error. Rows are never deleted
by the tooling; a rerun adds a row.

## Text report

`uv run shelfscanner report`

Two tables from whatever rows exist.

- Extraction, per model and image long edge: distinct photos with a
  successful row (the latest row per photo wins), error rows, median
  recall, mean invented per photo, p50 latency, mean cost.
- Recommendation, per model: distinct extractions with a successful row
  (latest wins), error rows, share of picks valid against the extraction,
  share valid against ground truth, mean specificity over scored rows and
  how many rows are scored, p50 latency, mean cost.

## Visual report

`uv run shelfscanner report --html <file>`

Writes a self-contained HTML page from the same rows: the test set and
models, per-model charts for both stages, a photo-by-model matrix whose
cells open the exact found, missed, invented and partial titles, every
recommendation with its reason side by side per photo with Marina's own
picks marked, and the pass/fail table against the proposal's criteria. The
recommendation section is restricted to runs on the best extraction of each
photo. No photos are embedded.

The page for change 001 is `docs/changes/archive/001-mvp/report.html`,
published as a private artifact.

## Environment

`.env` (see `.env.example`): `SUPABASE_URL`, `SUPABASE_SECRET_KEY`,
`OPENROUTER_API_KEY`. Missing keys stop the command with a message naming
them.
