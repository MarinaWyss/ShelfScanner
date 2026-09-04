# Run logging and reporting

Every model call produces a row in Supabase; the report reads them back.

## Where rows live

Project `ShelfScanner` (linked via the Supabase CLI). The runs tables are
`photos`, `extractions`, `recommendations`; the others are `sessions`,
`preferences`, `books`, `lookups`, `lookup_cache`, `saved` and `feedback`,
each described in its own spec. All are defined in `supabase/migrations/`.
RLS is enabled on every table with no policies; only `service_role` has
data privileges, and the code uses the service key from `.env`.

Every extraction and recommendation row records the model slug, the
adapter and provider that served it, the provider's request id, any
failover, the prompt filename, tokens, cost (as reported by OpenRouter, or
computed from tokens and config prices for direct adapters), latency and
any error. Rows are never deleted by the tooling; a rerun adds a row.

A spend guard and a regression check sit around the calls; both are
described in `model-router.md`.

Reporting is research tooling, not part of the pipeline; it lives in the
top-level `research/` package and is run as a module from the repo root.

## Matrix drivers

`uv run python -m research.matrix vision <aliases> [--max-dim N] [--set core|sourced|derived|all]`
runs every named model over every labelled photo of one set (default
`core`), in parallel by model.
`uv run python -m research.matrix llm <aliases> [--prefs file] [--prompt name] [--set ...] [--verify]`
runs every named model over the best extraction of each labelled photo in
the set (highest recall, fewest invented, earliest); `--verify` runs the
catalogue check first (`book-lookup.md`). Both only decide what to run;
rows are logged by the pipeline as usual. The report ends with a
`PRICES` line: the config's `prices_checked` date and whether it is older
than 90 days (002 D5).

`uv run python -m research.report --by-prompt [--set core] [--photos 1,2,3,4]`
(011) prints prompt versions side by side for the configured choosing
model: one row per prompt, preferences shape (`flat` or `export`) and
adapter, over the latest run per photo; runs, errors, the share of picks on
the list, the overlap with Marina's picks per photo, the mean and median
over `--photos` (default every photo with picks), p50 latency and cost.

`uv run python -m research.eval [--set core] [--reading-set all] [--check-set core] [--reading alias] [--choosing alias]`
(011) is the eval in one command: the reading primary over `--reading-set`
(default `--set`), the choosing primary over the best extraction per photo
in `--set`, then `research.check --set <check-set>`; the verdict is the
last line and the exit code. The nightly workflow runs
`research.eval --set core --reading-set all`.

## Text report

`uv run python -m research.report`

Two tables from whatever rows exist.

- Extraction, per model, adapter and image long edge: distinct photos
  with a successful row (the latest row per photo wins), error rows,
  median recall, mean invented per photo, p50 latency, mean cost, rows
  answered after a failover.
- Recommendation, per model and adapter: distinct extractions with a
  successful row (latest wins), error rows, share of picks valid against
  the extraction, share valid against ground truth, mean specificity over
  scored rows and how many rows are scored, p50 latency, mean cost,
  failovers.

## Visual report

`uv run python -m research.report --html <file>`

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
`OPENROUTER_API_KEY`, and per direct adapter `GEMINI_API_KEY`,
`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`; `SHELFSCANNER_SPEND_CAP_USD`. The
app's own: `SHELFSCANNER_SCANS_PER_HOUR`, `SHELFSCANNER_SCANS_PER_ADDRESS_HOUR`,
`SHELFSCANNER_APP_DAILY_CAP_USD`, `SHELFSCANNER_ADMIN_SECRET`, `SHELFSCANNER_RETENTION_DAYS`,
`SHELFSCANNER_FAKE_PIPELINE` (`web.md`, `monitoring.md`, `photo-storage.md`). A
missing Supabase key stops the command with a message naming it; a
missing provider key is an error on that call, which failover can catch.
Provider keys already present in the shell environment are used as well.
The web app has its own per-day cap across every session,
`SHELFSCANNER_APP_DAILY_CAP_USD`, described in `web.md` (008).
