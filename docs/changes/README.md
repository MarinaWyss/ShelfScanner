# Changes: the roadmap and how phases run

One folder per phase. Each phase is one change that leaves the app working
end to end, ordered by risk, and each ends with a result Marina looks at
once. Completed changes move to `archive/`.

## Roadmap

Two tracks run in parallel in separate worktrees: the **app** track builds
what a user touches; the **quality** track builds what makes the answers
good. They meet at 005. Weeks are deadlines, not estimates; a deadline
forces the "what can wait" decision, and what waits goes in the proposal's
out-of-scope list.

| # | Change | Track | Week ending | Needs |
|---|---|---|---|---|
| 002 | Provider router, failover, CI and the regression gate | quality | 2026-09-09 | approved 2026-09-02 |
| 003 | App shell: photo to titles on a phone, over the local network | app | 2026-09-16 | 002 task 1 |
| 004 | Preferences: Goodreads export, prompt v2, overlap eval | quality | 2026-09-16 | 002 for the eval only |
| 005 | Recommendations in the app, saved list, feedback | app | 2026-09-23 | 003, 004 |
| 006 | Test set: sourced shelf photos, nightly eval, the lookup decision | quality | 2026-09-16 | 002 for the runs only |
| 007 | Book lookup or enrichment, whichever 006 decides | quality | 2026-09-23 | 006 for the wiring only |
| 008 | Hardening: limits, cost cap, retention, errors; caching if measured | app | 2026-09-23 | 003; 007 for caching |
| 009 | Monitoring: dashboard from the rows, weekly review | either | 2026-09-23 | 003, 005 |
| 010 | Deployment: Vercel from GitHub | app | 2026-09-30 | 008; Marina connects the repo |

Where this departs from the earlier plan: CI and the regression gate are
part of 002, not a testing phase; the test set gets its own phase (006)
and is sourced online rather than photographed; saved list and feedback
ride with recommendations (005) because they are small once picks are on
screen. Deployment is last (010): until then the app runs on the laptop
and the phone reaches it over the local network, which is enough for
every acceptance test and needs no account.

## Waves

Phases are the unit of scope and review; waves are the unit of work. A
task starts as soon as what it needs exists, not when its phase begins,
so most of the roadmap runs as four waves of parallel worktrees rather
than nine phases in a row. A phase is still reviewed and archived as one.

**Wave 1**, ends 2026-09-09. Nothing here needs a live model beyond the
five-photo reruns in 002.

- Contract first, by the lead alone, before any fan-out: the `ModelClient`
  interface and result shape (002 task 1), the preferences object's keys
  (004 D1), the label-file fields for sourced and derived photos (006), and
  the `sessions` columns (003 task 1). Half a day; everything below builds
  against these.
- Then in parallel: 002 task 0 (rails) · 002 tasks 2, 3, 4 (one adapter
  each) · 003 task 3 (page, client resize, Playwright with a fake client)
  · 004 tasks 1 to 3 (importer, schema, prompt v2) · 006 tasks 1 and 2
  (source and degrade photos, labels; four workers at five photos each) ·
  007 tasks 1 and 2 (lookup module against a recorded fixture, schema) ·
  008 task 3 (retention job).
- Then 002 task 5 (failover) and 003 task 2 (the scan endpoint on the real
  router), which need the adapters merged.

**Wave 2**, ends 2026-09-16. Needs the adapters and the endpoint.

- In parallel: 003 task 4 (phone test) · 004 task 4 (the eval, sets the
  default prompt) · 006 tasks 3 to 5 (nightly job, run the sets, the
  lookup decision) · 008 tasks 1 and 2 (limits, errors and validation) ·
  009 task 1 (metrics module) and task 3 (weekly review routine).
- 002, 003, 004 and 006 close: results, specs, archive.

**Wave 3**, ends 2026-09-23. Needs the eval's default and the lookup
decision.

- In parallel: 005 tasks 2 to 4 (preferences page, recommendation in the
  scan, save and feedback; one worker each after the schema) · 007 tasks
  3 and 4 (wire the lookup per 006's decision, measure) · 009 task 2
  (dashboard page).
- Then 008 task 4 (caching, by 007's numbers) and 005 task 5 (e2e, phone).
- 005, 007, 008, 009 close.

**Wave 4**, ends 2026-09-30. 010, once Marina has connected the repo to
Vercel.

### Contracts for wave 1

Written by the lead on 2026-09-02 and merged to main before the fan-out.
Workers implement these; a worker that finds one wrong stops and says so.

**Model calls** (`src/shelfscanner/router.py`, `adapters/base.py`). An
adapter is a class with `vision(model, prompt, image_jpeg, *, max_tokens,
on_progress)` and `text(model, prompt, input_text, *, max_tokens,
on_progress)`, both returning `CallResult`. `model` is the `Model` from
config: use `model.id_for_adapter` as the id, `model.reasoning_effort` for
the reasoning control, `cost_from_tokens(model, in, out)` for cost with
reasoning tokens counted in output. Never raise for a model or transport
failure: return a result with `error` set (`failed()` helps). Report a
reply cut off by the output cap with `finish_reason="length"` so
`parse_or_error` records truncation, not a parse failure. Fill
`request_id` and `adapter`. The class is registered by name in
`router.ADAPTERS` already: `google` → `adapters/google.py:GoogleClient`,
`openai` → `adapters/openai.py:OpenAIClient`, `anthropic` →
`adapters/anthropic.py:AnthropicClient`. Each adapter module is the only
file that imports its SDK. Pipeline code passes `client=` to inject a
fake; `tests/test_router.py` shows one.

**Config** (`config/models.toml`). A model block gains `adapter` and
`model_id` when it goes direct; `slug` stays and is what the `model`
columns log. `[stages.reading]` and `[stages.choosing]` name `primary`
and `fallback` aliases. New columns on both run tables: `adapter`,
`request_id`.

**Preferences object** (004). JSON with keys `genres` (list of strings),
`free_text` (string), `rated_books` (list of `{title, author, rating}`,
rating 1 to 5), `to_read` (list of `{title, author}`), `avoid` (list of
strings). The importer produces it; `recommend_v2` consumes it; the old
flat shape (`genres`, `likes`, `loved_books`, `avoid`) is still accepted
by `recommend_v1` and converted by `preferences.upgrade()` for v2.

**Label files** (006). Existing keys unchanged: `titles`, `partial`,
`notes`. New optional keys: `set` (`core`, `sourced`, `derived`; absent
means `core`), `provisional` (bool), `source` (`{url, author, license,
license_url, query}`), `derived_from` (stem of the original),
`degradation` (`{kind, params}`). Sourced photos are fetched by
`shelfscanner photos fetch` from `source.url` into `data/photos/`. The
`photos` table gains `set`, `provisional`, `source` (jsonb).

**Sessions** (003). Table `sessions(id identity, token_hash text unique,
created_at, last_seen_at)`; `photos.session_id bigint null references
sessions`. Test-set photos have a null session. The cookie holds the raw
token; only its hash is stored.

**Book records** (007). Table `books(id identity, catalogue text,
catalogue_id text, title, author, first_year int, cover_id text,
fetched_at)`, unique on `(catalogue, catalogue_id)`. The lookup module's
one public function is `lookup(title, author) -> Match | None` with
`Match(record, score)`.

**CLI additions.** A worker that adds a command puts an
`add_parser(subparsers)` function in its own module; the lead wires one
line in `cli.py`. Workers do not edit `cli.py`, `db.py`, `config.py`,
`settings.py` or `pyproject.toml`; the SDKs and web and test dependencies
are already installed.

Rules that make the fan-out safe:

- **Contracts before workers.** A worker never invents a shared interface;
  it implements one the lead wrote. If the contract is wrong, the worker
  stops and says so.
- **File ownership.** Each worker's prompt lists the files it owns. Shared
  files (`cli.py`, `db.py`, `config.py`, `config/models.toml`,
  `pyproject.toml`) are edited only by the lead, or by a worker in a
  clearly marked block the lead merges by hand. Migrations are new files
  with fresh timestamps; only the lead runs `supabase db push`.
- **Fakes at the seams.** The web layer tests against a fake `ModelClient`;
  the lookup tests against a recorded fixture; the importer against an
  anonymised CSV. No worker needs a provider key except the adapter and
  eval workers, and those carry the spend cap.
- **One branch per worker, merged by the lead** after the gates, smallest
  branch first, with a full test run on main after each merge.

## What Marina supplies

Everything else runs unattended.

1. **Batch approval** of proposals 002 to 010. Given 2026-09-02.
2. **Goodreads export**: `data/prefs/goodreads_library_export.csv`, already
   there and gitignored.
3. **Connect the repo to Vercel** at 010, and only then. The app is laid
   out for Vercel's Python runtime from 003, so this is a click and a
   set of environment variables.
4. **One look per phase** at `results.md` and the linked page.

Shelf photos for 006 are sourced by an agent from openly licensed images
(details in 006). Nothing is needed from Marina for that.

Defaults taken to avoid questions: FastAPI with server-rendered pages and
htmx (phone-first, little client code, easy to drive headlessly); Vercel
from GitHub, no container; GitHub Actions for tests; Open Library for
lookup; Playwright for end-to-end tests; openly licensed photos (CC0, CC BY, public domain) with
source and licence recorded per photo.

## How a phase runs

A lead session works the wave, following each phase's `tasks.md`. Tasks
marked `∥` are independent and go to worker agents in their own
worktrees, one branch each; the lead merges. Nothing is asked of Marina mid-phase: a question the
proposal does not answer is decided by the lead, recorded in the proposal
under "Decided during the work", and flagged in `results.md`.

Gates, all automated, all must pass before a task is done:

- `uv run pytest` and `uv run ruff check` green (CI runs both on every push).
- `uv run python -m research.check`: the five-photo report compared to
  `research/baseline.json` (change 001's numbers). Any regression in
  recall, invented, overlap, p50 latency or cost per scan fails.
- For app phases: the Playwright suite passes against a local server.
- `docs/specs/` changed in the same branch as `src/`, or the commit says
  `no-spec` and why.
- A reviewer agent (`/code-review`) has run on the branch and its findings
  are fixed or answered in the PR.
- Spend for the phase, summed from the runs table, is under the cap in the
  proposal. Model-calling commands refuse to run past the cap.

Gates at the end of a phase:

- Every row in the proposal's "How we know it worked" table has a number
  or a passing test next to it in `results.md`.
- Specs updated, folder archived, scoping doc section 10 updated.
- A short `results.md` and, where there is something to see, a published
  page. That is what Marina reads.

Stop conditions, where the lead halts and reports instead of pushing on:
a gate fails twice on the same task; the fix needs something out of scope;
a provider or account is unreachable; spend reaches the cap.

## CLAUDE.md rules

Rules 1 and 2 in `CLAUDE.md` were amended on 2026-09-02 with Marina's
approval: this roadmap approves 002 to 010 as written, and the gates above
replace the per-task review. Rules 3 and 4 are unchanged.
