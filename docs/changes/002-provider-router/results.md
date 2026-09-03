# 002 — Results (in progress)

Date: 2026-09-02, wave 1. Rows in `extractions` and `recommendations`;
`uv run python -m research.report` groups them by model and adapter.

## What was built

- `ModelClient` interface, router, per-stage primary and fallback in
  config, `adapter` and `request_id` and failover columns on both run
  tables. Spec: `docs/specs/model-router.md`.
- Four adapters: OpenRouter (refactored), Google, OpenAI, Anthropic, each
  with unit tests against a stubbed SDK.
- Native structured output attached by the pipeline for the three direct
  adapters.
- Failover from the stage primary to its fallback on provider errors and
  truncation, recorded on the row.
- Rails: ruff, CI on every push, `research.check` against
  `research/baseline.json`, a spend guard.

## Measured so far

Only the Anthropic adapter could be run live: an `ANTHROPIC_API_KEY` was
present in the shell environment. `GEMINI_API_KEY` and `OPENAI_API_KEY`
are not set anywhere yet, so the Google and OpenAI rows below are pending.

Reading, five core photos, 1568 px, `extract_v1`:

| Model | Path | Median recall | Invented / photo | p50 latency | Cost / photo |
|---|---|---|---|---|---|
| Claude Sonnet 5 | OpenRouter (change 001) | 1.00 | 0.0 | 10.0 s | $0.0147 |
| Claude Sonnet 5 | direct, structured output | 1.00 | 0.0 | 5.0 s | $0.0090 |
| Gemini 3.8 Flash | OpenRouter (change 001) | 1.00 | 0.0 | 11.6 s | $0.0076 |
| Gemini 3.8 Flash | direct | not run: the key is valid but the Google project has no prepaid credit (`http 429 RESOURCE_EXHAUSTED`, 2026-09-03); every call failed over to Sonnet | | | |

Same reading quality, half the latency, 39 % less cost for Sonnet direct.
The cost difference is OpenRouter's markup plus reported-versus-computed
accounting; the latency difference is the extra hop and, likely, adaptive
thinking at its default instead of OpenRouter's passthrough.

Failover, observed live on photo 4 with no Gemini key: primary failed with
the missing-key error, the router ran Sonnet, the row records both
(`failover_from = google/gemini-3.8-flash`). 5.5 s end to end.

Choosing, GPT-5.4 mini direct (2026-09-03, with the key; the full grid is
in change 004's results): 25 of 25 picks on the list on every prompt except
v2 with the Goodreads export, where three of five runs put picks off the
shelf and R1 caught them; that finding produced `recommend_v3`, now the
default. On v3 with the flat file: p50 2.4 s, $0.0021 a run, overlap
median 4 against change 001's 4 through OpenRouter (3.2 s, $0.0020).
`research.check` passes on the direct rows.

Choosing before the key: pending `OPENAI_API_KEY`. The OpenRouter path hit an upstream
429 on Qwen during a smoke run and logged it as an error row, which is the
case failover now covers.

Regression check on the change 001 rows: PASS (recall 1.00, invented 0,
overlap 4, p50 and cost within tolerance).

## Against the proposal's criteria

| Question | Pass | Result so far |
|---|---|---|
| Same or better reading | Gemini direct: recall ≥ 0.95, invented 0 | **pending Google credit**; Sonnet direct 1.00 / 0 |
| Same or better choosing | GPT-5.4 mini direct: 25/25 on list, overlap ≥ 3 | 25/25 on v3, overlap median 4 |
| Faster | both stages under 10 s p50 | reading 5.0 s on Sonnet direct; choosing 2.4 s on GPT-5.4 mini direct |
| Swappable | reading stage to Sonnet is a config edit | yes: `[stages.reading] primary` |
| Nothing lost | every spike field still logged, plus request ids | yes, plus adapter and failover |

## Decided during the work

See the proposal's section of the same name: one entry per worker.

## Still to do in this change

1. Gemini 3.8 Flash direct over the five photos, then at low effort (D4).
2. GPT-5.4 mini direct over the five best extractions, overlap against 001.
3. Update `research/baseline.json` if the defaults change; rerun `check`.
4. Archive.
