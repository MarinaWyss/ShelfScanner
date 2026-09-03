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
