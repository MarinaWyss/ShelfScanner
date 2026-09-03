# Extraction

A vision model reads a photo; the result is scored against the photo's
labels and logged.

## Command

`uv run shelfscanner extract --photo <id|all> [--model <alias|slug>] [--max-dim N] [--prompt name]`

`--model` unset means the reading stage's primary from config, with
failover to its fallback (see `model-router.md`).

For each photo:

1. Download the object from the bucket and resize so the long edge is at
   most `--max-dim` pixels (default from `config/models.toml`, 1568). Never
   upscales. The dimensions actually sent are logged.
2. Send the image and the prompt file `prompts/<name>.md` (default
   `extract_v1`) to the model through the router, with the books schema
   for adapters that support structured output. The prompt asks for
   `{"books": [{"title", "author"}]}`; the reply is parsed in code.
3. Score the returned titles against the labels.
4. Insert one `extractions` row. A transport error, HTTP error, truncated
   reply or unparseable reply still produces a row, with `error` set and
   metrics at their defaults.

Prints one line per photo and, for `all`, a summary with median recall,
total invented and total cost.

## Matching

A returned title matches a label when the best sequence ratio across their
forms is at least `match_threshold` (config, 0.85), or when a form of the
label of at least two words appears whole inside the returned title.
Forms of a title: the whole thing; the part before a colon; the part after
the last colon or spaced dash. Normalisation: lowercase, accents and
punctuation stripped, whitespace collapsed, a leading or trailing article
dropped.

Per photo:

- `found` — labels that some returned title matched. Each label counts
  once; a second returned title matching the same label is a duplicate and
  is neither found nor invented.
- `missed` — labels nothing matched.
- `invented` — returned titles matching no label, full or partial.
- `partial_matched` — returned titles matching a partial label. Excluded
  from all three counts.

Recall is `found / (found + missed)`.

## Model config

`config/models.toml` lists models by alias with the OpenRouter slug,
provider, prices, an optional `reasoning_effort`, and the `adapter` that
serves it (default `openrouter`) with the provider's own `model_id` when
direct. `[stages.reading]` and `[stages.choosing]` name a primary and a
fallback alias. `--model` accepts an alias, a slug or a model id.

## Router and adapters

Pipeline code calls `router.vision` or `router.text` with a `Model`; the
router instantiates the adapter named in config, or uses a client passed
in by the caller (tests, the web layer). Every adapter returns the same
result: raw text, parsed JSON, input, output and reasoning tokens, cost,
latency, finish reason, provider, request id, adapter name. A reply cut
off by the output cap is reported as truncation, distinct from a JSON
parse failure. The OpenRouter adapter is one POST via httpx with usage
accounting on and cost as OpenRouter reports it. Nothing is retried.

## Logged row

`extractions`: `photo_id`, `provider`, `adapter`, `request_id`, `model` (slug of the model that answered), `failover_from`, `failover_error`, `prompt_version`
(prompt filename), `image_long_edge`, `image_width`, `image_height`,
`raw_output`, `parsed_titles`, the four lists above, `found_count`,
`missed_count`, `invented_count`, `latency_ms`, `input_tokens`,
`output_tokens`, `cost_usd`, `error`, `created_at`.
