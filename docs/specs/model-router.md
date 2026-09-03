# Model router

Which adapter serves a model, which model serves a stage, and what happens
when the primary fails.

## Calls

Pipeline code never imports a provider SDK. It calls `router.vision(model,
prompt, image_jpeg, schema=...)` or `router.text(model, prompt, input_text,
schema=...)`; the router hands the call to the adapter named by
`model.adapter`, or to a client passed in as `client=` (tests, the web
layer). Both return a `CallResult`: raw text, parsed JSON, input, output
and reasoning tokens, cost, latency, finish reason (`stop`, `length`, or
the provider's own value), provider, request id, adapter name, error. An
adapter never raises for a provider or model failure; the result carries
the error.

`schema` is the reply's JSON Schema (`BOOKS_SCHEMA`, `RECOMMENDATIONS_SCHEMA`
in `adapters/base.py`). Adapters with native structured output attach it;
the OpenRouter adapter ignores it and relies on the prompt. A reply cut off
by the output cap is reported as `length` and the error says `truncated`,
distinct from a JSON parse failure.

## Adapters

One module per provider in `src/shelfscanner/adapters/`, registered by name
in `router.ADAPTERS`: `openrouter` (httpx, cost as OpenRouter reports it),
`google` (google-genai SDK), `openai` (openai SDK, Responses API),
`anthropic` (anthropic SDK, Messages API). Direct adapters compute cost from
tokens and the config prices, reasoning priced as output. The adapter
module is the only place its SDK is imported; a missing SDK or key is
reported on the first call, naming what is missing.

Reasoning effort comes from `model.reasoning_effort` in config and is
mapped per provider (OpenRouter `reasoning.effort`; Gemini thinking level;
OpenAI `reasoning.effort`; Anthropic adaptive thinking with effort on
Sonnet 5, a token budget on Haiku). Unset means the provider's default.

To add a provider: a module exposing a class with `vision` and `text`, an
entry in `router.ADAPTERS`, a key name in `.env.example`, unit tests with
a stubbed SDK client covering success, truncation, transport error and an
unparseable reply.

## Config

`config/models.toml`: each model has `slug` (logged in `model` columns),
`provider`, prices, optional `reasoning_effort`, `adapter` (default
`openrouter`) and `model_id` (the provider's own id for a direct adapter).
`[stages.reading]` and `[stages.choosing]` name `primary` and `fallback`
aliases. `--model` on `extract` and `recommend`, and `--vision-model` and
`--llm-model` on `run`, are optional; unset means the stage's primary.

## Failover

When the model in use is the stage's primary and its call fails for a
provider reason (HTTP error, transport error, SDK error, missing key,
truncation), the stage runs once more on the fallback. The row records
the model that answered in `model` and the first attempt in
`failover_from` and `failover_error`. A parse failure or a wrong pick
count is a finding about the model and is not retried. An explicitly
chosen non-primary model never fails over, so comparison rows stay per
model. The report counts failovers per model and adapter.

## Guards

Before any real provider call the spend guard sums `cost_usd` over both
run tables since `settings.spend_since` in config and refuses when the sum
reaches `SHELFSCANNER_SPEND_CAP_USD` from the environment; unset means no
cap. Calls with an injected client are not guarded.

`uv run python -m research.check [--set core] [--json]` builds the report
for the stage primaries over labelled photos and compares it with
`research/baseline.json`; any regression in recall, invented, on-list
share, overlap, or more than 10 % on p50 latency or cost per stage fails
with the metric named. CI runs lint and tests on every push; the check
needs the database and is run by hand or by the nightly job (change 006).
