# 002 — Tasks

Work in order. Stop after each for review.

## 1. Interface and router

- `ModelClient` protocol with `vision` and `text`, and the shared result
  dataclass (the spike's `CallResult` plus provider request id).
- Router module reading `config/models.toml`: per-stage model, reasoning
  setting, image size; candidates list unchanged.
- The existing OpenRouter module refactored into the first adapter behind
  the router, so everything still runs end to end before any new provider.

Done when: `run --photo 4` produces the same rows as before through the
router.

## 2. Google adapter

- Gemini via the official SDK, native structured output, reasoning effort
  from config, cost computed from tokens and config prices.
- Gemini 3.8 Flash at low effort over the five photos; compare to change
  001's numbers; set the default accordingly.

Done when: `extract --photo all --model gemini-flash` runs direct and the
report shows recall, invented, cost and latency next to the OpenRouter row.

## 3. OpenAI adapter

- GPT-5.4 mini via the official SDK, structured output, reasoning effort.
- Recommendation matrix over the same five best extractions; compare
  overlap to change 001.

Done when: `run` with both direct adapters completes under 10 s p50 on the
five photos.

## 4. Anthropic adapter

- Sonnet 5 via the official SDK as the reading fallback, adaptive thinking
  with effort from config.

Done when: switching the reading stage to `sonnet` is a config edit and the
matrix reruns clean.

## 5. Specs, results, archive

- `docs/specs/model-router.md` describing the interface, config and how to
  add a provider; `extraction.md` and `recommendation.md` updated where the
  adapter changed.
- `results.md` with the before/after table against change 001.
- Change folder to archive.
