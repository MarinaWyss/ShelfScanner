# 002 — Provider adapters behind our own router

Status: approved 2026-09-02
Date: 2026-09-02
Deadline: 2026-09-09
Spend cap: $5

## Why

Change 001 answered the two viability questions with yes and chose a pair:
Gemini 3.8 Flash for reading, GPT-5.4 mini for choosing. It also produced
three findings that shape what comes next.

1. **Latency is the tight constraint.** The chosen pair lands at 14.8 s p50
   against a 15 s target, through OpenRouter's extra hop, with most of the
   time spent on reasoning tokens we have not yet tried to control.
2. **Models turn over fast.** Every model that passed is under a year old;
   the ones that failed were the best available eighteen months ago. The
   comparison was cheap only because every model was a config entry behind
   one adapter. Whatever replaces the OpenRouter adapter must keep that.
3. **The preferences input limits recommendations more than the model.**
   That is a separate change (004), noted here because the router must not
   assume the preferences shape is fixed.

This change replaces the throwaway OpenRouter adapter with the real
provider integrations, behind a router of our own, and uses the native
controls to bring latency down. It does not add features.

## What changes

- A `ModelClient` interface with two operations, `vision(image, prompt)`
  and `text(prompt, input)`, returning the same result shape the spike logs
  today: raw text, parsed JSON, input, output and reasoning tokens, cost,
  latency, finish reason, provider, model.
- One adapter per provider implementing it: Google (Gemini) and OpenAI
  first, Anthropic third as the reading fallback. Each uses the provider's
  own SDK, native structured output where available, and the provider's
  reasoning control.
- A router that reads `config/models.toml` and hands each stage its client.
  The config gains, per stage, the model in use and its reasoning setting;
  the candidate list stays for comparisons.
- `extract`, `recommend`, `run` and `report` unchanged in behaviour; they
  call the router instead of the OpenRouter module. Cost comes from the
  provider's usage block priced with the config prices, since the direct
  APIs do not report dollars.
- The OpenRouter adapter stays as one more provider behind the router, for
  trying models we have no SDK for.

### Out of scope

- Preferences capture, Goodreads import (004).
- A larger test set (006). This change reruns the existing five photos.
- Book-database lookup, UI, deployment.

## Decisions

**D1. Our own router, not a framework.** Two operations and a config lookup
do not justify an orchestration library, and a library is exactly the kind
of dependency that turns a model swap into a migration. The router is a
small module we own.

**D2. Provider SDKs, not raw HTTP.** The spike used raw HTTP to avoid three
SDK integrations in throwaway code. The real pipeline wants the SDKs for
structured output, reasoning controls, retries and streaming. Each adapter
is the only place a provider's SDK is imported.

**D3. Structured output is native where it exists.** The prompt still
describes the JSON, but the adapter also passes the schema through the
provider's structured-output feature. Parse failures should stop being a
finding and start being a bug.

**D4. Reasoning is set per stage in config**, never left at a provider
default. The spike showed a default budget can consume the whole reply.
The first experiment in this change is Gemini 3.8 Flash at low effort on the
five photos: if recall and zero-invented hold, it becomes the default.

**D5. Cost is computed, not reported.** Tokens from the usage block times
the config prices, with reasoning tokens priced as output. The config
prices carry a checked-on date; `report` flags when they are older than 90
days.

**D6. Swapping a model is a config change plus a rerun of the test set.**
The `report` output on the five photos is the acceptance test for any
model change, compared against the numbers in change 001's results.

**D8. Failover is automatic and logged.** Each stage names a primary and a
fallback model in config. On a provider error, timeout or truncated reply
the router retries once on the fallback, and the row records both
attempts. Failover is for outages, not quality: the fallback is a model
that passed the same test, and `report` shows how often it was used.

**D9. This change also lays the rails for unattended work.** CI running
tests and lint on every push, and `research.check`, which compares the
five-photo report to a committed baseline and fails on regression. Every
later phase relies on both, so they come first.

**D7. Streaming is out of scope here but the interface leaves room for it.**
The result shape gains an optional progress callback so the later UI change
can show which stage is running.

## How we know it worked

| Question | Pass |
|---|---|
| Same or better reading | Gemini direct: median recall ≥ 0.95, invented 0 on the five photos |
| Same or better choosing | GPT-5.4 mini direct: 25/25 on the list, median overlap ≥ 3 |
| Faster | p50 for both stages under 10 s, measured from the CLI |
| Swappable | Switching the reading stage to Sonnet 5 is a one-line config change and the matrix reruns without code edits |
| Nothing lost | Every field the spike logged is still logged, plus provider request ids |

## Risks

- **Native structured output changes model behaviour.** Some models read
  differently when constrained. Mitigated by rerunning the matrix and
  comparing to change 001.
- **Provider SDK churn.** The Anthropic reference already notes API drift
  within a year. Mitigated by keeping each SDK behind one adapter file with
  its own tests.
- **Computed cost drifts from billed cost.** Mitigated by the price check
  date and by a monthly reconciliation against the provider invoices, noted
  as an operational task.

## Decided during the work

Task 3, the OpenAI adapter (2026-09-02):

- **Responses API, not Chat Completions.** It is the surface OpenAI documents
  for GPT-5.x (reasoning and structured-output guides), it reports truncation
  explicitly (`incomplete_details.reason == "max_output_tokens"`), and from
  GPT-5.4 Chat Completions no longer supports reasoning effort with tools.
  Verified against the installed SDK (`openai` 3.7.0) and the API docs.
- **Model id `gpt-5.4-mini`**, the unpinned alias, from the SDK's own model
  list (`openai/types/shared/chat_model.py`, which also lists the dated
  `gpt-5.4-mini-2026-03-17`) and the docs' model page. The alias is used so
  the config tracks OpenAI's current snapshot; the response's `model` field
  records the dated snapshot that actually served the call.
- **Reasoning effort passes through unchanged.** Config values are the SDK's
  own vocabulary (`none`, `minimal`, `low`, `medium`, `high`, `xhigh`,
  `max`); GPT-5.4 mini accepts none/low/medium/high/xhigh. A value the model
  rejects comes back as a 400 in the result's `error`. `None` in config
  omits the parameter, so `[models.gpt-mini]` currently runs at OpenAI's
  default (medium); setting it per stage is the experiment in D4, left for
  the matrix run once the key exists.
- **JSON mode by default, a strict schema on request.** The adapter asks for
  `text.format = json_object` unless it is constructed with a `schema=`
  dict, which switches to strict `json_schema`. The router instantiates
  adapters with no arguments, so the pipeline runs in JSON mode today;
  passing schemas per stage needs a small router change and is left for the
  lead so the three adapter workers do not each invent one.
- **A missing `OPENAI_API_KEY` is a result, not a crash.** The adapter returns
  a `CallResult` whose error names the key rather than raising `SystemExit`
  like `settings.py` does, so task 5's failover can treat it as a provider
  outage. The key is read after `load_dotenv(.env)`; `settings.py` is not
  edited.
- **`store=False` on every request.** Shelf photos may show private rooms;
  OpenAI keeps Responses by default, so the adapter opts out.
- **Image detail `auto`, timeout 180 s, SDK's default two retries.** `auto`
  matches what the OpenRouter path sent, so the direct-versus-OpenRouter
  comparison is like for like. Retries mean a logged latency can include a
  retried connection error; the SDK retries only on connection errors, 408,
  409, 429 and 5xx.
- **Cost.** The Responses API's `usage.output_tokens` already includes
  reasoning tokens, so `cost_from_tokens(model, input, output)` prices
  reasoning as output with no adjustment (D5); `reasoning_tokens` is logged
  from `output_tokens_details`.
- **`tests/test_config_and_adapter.py`** asserted every model was on
  OpenRouter; that is false once any model goes direct, so the assertion now
  checks each adapter is a key of `router.ADAPTERS`. The Google and
  Anthropic branches will need the same line.

**Task 2, Google adapter (2026-09-02).**

- **Model id `gemini-3.8-flash`**, verified against the installed SDK's own
  model list (`google-genai` 2.22.0, `google/genai/_gaos/types/interactions/model.py`,
  "Gemini 3.8 Flash - Our most intelligent Flash model"). No live key was
  available to call `models.list`.
- **Reasoning effort maps to `thinking_level`, not `thinking_budget`.** The
  SDK states that Gemini 3.5 and later reject a budget. `none`/`minimal` →
  MINIMAL, `low` → LOW, `medium` → MEDIUM, `high` → HIGH; unset means no
  thinking config (the model's default). A Gemini 3 Flash cannot switch
  thinking off, so `none` is the floor, not zero.
- **A missing `GEMINI_API_KEY` is a failed `CallResult`, not an exit**, so
  task 5's failover ("pulling the Google key makes `run` complete on
  Sonnet 5") can act on it. The error names the key and `.env.example`.
- **Schema is a constructor argument.** `GoogleClient(schema=...)` attaches
  a JSON schema via `response_json_schema`; with none, the call asks for
  `application/json` only. `BOOKS_SCHEMA` and `RECOMMENDATIONS_SCHEMA` are
  exported from the adapter for whoever wires them. Because
  `router.client_for` constructs adapters with no arguments, pipeline calls
  are mime-type-only until the router or the stage passes a schema. Open.
- **`output_tokens` includes thinking tokens**; `reasoning_tokens` carries
  them separately. Gemini reports `candidates_token_count` without thoughts,
  so the adapter adds `thoughts_token_count` before pricing (D5).
- **SDK retries capped at one** (`HttpRetryOptions(attempts=2)`) and a 180 s
  timeout. The SDK default of five attempts with backoff to 60 s would hide
  an outage behind the latency target; outages are the router's job (D8).
- **`CallResult.model` is the provider id** (`gemini-3.8-flash`); `slug`
  stays what the `model` columns log, per the config contract.
- **`tests/test_config_and_adapter.py`** asserted every model uses the
  OpenRouter adapter; relaxed to "OpenRouter, or a direct adapter with a
  `model_id`" since the config contract makes that the invariant.

Task 4, Anthropic adapter (2026-09-02, worker; flagged for `results.md`).

- **Model ids** are `claude-sonnet-5` and `claude-haiku-4-5`, taken from the
  claude-api skill's model table (cached 2026-06-24), not from memory. No
  date suffixes: those ids are complete as-is.
- **Effort mapping.** Sonnet 5 takes adaptive thinking, so `reasoning_effort`
  becomes `thinking={"type": "adaptive"}` plus `output_config.effort` for
  `low`/`medium`/`high`/`xhigh`/`max` (`minimal` is an alias for `low`);
  `none` disables thinking; absent sends nothing (provider default: adaptive
  at `high`). Haiku 4.5 rejects `effort` and still wants `budget_tokens`, so
  there the same values become a budget of 1024 / 4096 / 16384 tokens,
  capped at `max_tokens - 1024` and dropped below the API minimum of 1024.
  An unknown value is a failed result naming it, not an exception.
- **Structured output without a schema in the contract.** `ModelClient` has no
  schema argument, so the adapter carries the two shapes the prompts ask for
  today (`{"books": [{title, author}]}` for `vision`, `{"recommendations":
  [{title, reason}]}` for `text`) and passes them as `output_config.format`.
  A constructor argument overrides or disables them. If 004's prompt v2
  changes the recommendation shape, this schema must change with it; the
  cleaner fix is a `schema` parameter on the contract, for the lead.
- **Missing key is a failed result, not an exit.** `ANTHROPIC_API_KEY` is
  read from `.env` on first use; when absent every call returns `error`
  naming the key and `.env.example`, so a failover onto Sonnet 5 logs the
  problem instead of aborting the run. The SDK client is built lazily, so
  tests inject a stub and nothing touches the network.
- **Stop reasons.** `end_turn`/`stop_sequence` are `stop`; `max_tokens` and
  `model_context_window_exceeded` are `length`; `refusal`, `tool_use` and
  `pause_turn` are kept verbatim and set `error`. Reasoning tokens come from
  `usage.output_tokens_details.thinking_tokens`, already inside
  `output_tokens`, so `cost_from_tokens` prices them as output (D5).
- **Tests only, no live run.** There is no Anthropic key in `.env`, so
  `uv run shelfscanner extract --photo all --model sonnet` and the "switch
  the reading stage to sonnet" acceptance rerun are follow-ups once the key
  exists.
- **One line in `tests/test_config_and_adapter.py`** asserted every model was
  on OpenRouter; it now asserts every adapter is a name in `router.ADAPTERS`,
  the same edit main already carries from tasks 2 and 3.

Task 0 (rails), 2026-09-02, by the worker; not asked of Marina.

- **Baseline latency for reading is 11.6 s**, Gemini 3.8 Flash's own p50 in
  change 001's table (10.0 s was Sonnet's). Choosing is 3.2 s. Both stored in
  ms in `research/baseline.json`, keyed by set (`core`) and stage, with the
  model slug that produced them so 006 can add sets and a swap stays visible.
- **What `research.check` compares.** Per stage: median recall, invented per
  photo, on-list share (`valid_vs_extraction` over all picks; the hard
  constraint from 001 D5), median overlap with `marina_picks.json`, p50
  latency and mean cost; plus cost per scan (the two means summed). Recall,
  invented, on-list share and overlap may not drop at all; latency and cost
  may rise by up to 10 %, per stage and per scan.
- **A gap is a failure.** A labelled photo of the set with no error-free row
  for a primary fails the check (`reading: 4 of 5 photos ...`), since a
  missing photo would otherwise hide behind a better median.
- **Which rows count.** Labelled photos only (non-empty `titles`); the `set`
  key on the photo row when present, absent meaning `core` (006 contract);
  extraction rows at the configured `default_max_edge`; the latest error-free
  row per photo for each stage, a recommendation belonging to the photo of
  its extraction whichever model made that extraction. Error rows are
  counted and printed but do not score, as in `research.report`.
- **A swapped primary is compared against the same numbers**, per D6, with a
  note in the output rather than a failure. `--set` selects both the photos
  and the baseline entry; `--json` prints measured, baseline and regressions.
- **Spend guard.** `SHELFSCANNER_SPEND_CAP_USD` unset means no cap and no
  database query. `spend_since` is read straight from `[settings]` in
  `config/models.toml` by `shelfscanner.spend` (config.py is the lead's and
  gains no field); a missing key means since the epoch. The guard refuses at
  the cap, not only past it (`spent >= cap`), and runs only for real provider
  calls: `extract_photo` and `recommend_from_extraction` skip it when a
  `client` is injected, since a fake spends nothing and the web tests must not
  need a database. That is an `if` of two lines rather than one.
- **ruff config** lives in `ruff.toml` (not `pyproject.toml`): the defaults
  plus `W`, `I` (import order), `UP` (pyupgrade) and `B` (bugbear). Line
  length is not enforced; the report and the HTML page are wide on purpose.
- **CI** uses `astral-sh/setup-uv@v6` with `.python-version` (3.12), then
  `uv sync --frozen`, `uv run ruff check .`, `uv run pytest -q`. No Playwright
  browser install yet; 003 adds it when a test first needs one.
- **No spec change in this task.** The spend guard and the check are
  behaviour, but task 6 owns `docs/specs/`; its `extraction.md`,
  `recommendation.md` and `run-logging.md` updates should mention both.

**Lead, 2026-09-03.** `DEFAULT_MAX_TOKENS` raised from 4,096 to 8,192 after a
dense sourced shelf truncated on Sonnet 5 direct with 3,428 reasoning tokens
inside the old cap. Failover did not apply because the model was chosen
explicitly for that run, which is the intended behaviour for matrix rows.

**Lead, 2026-09-03, choosing fallback.** `qwen-flash` replaced by `haiku` as the
choosing fallback. Two real scans through the app failed over from the keyless
primary onto Qwen via OpenRouter and both got an upstream 429 from the shared
pool, so the fallback did not fall back. Haiku 4.5 direct passed change 001's
choosing test weakly and has a working key on this machine.
