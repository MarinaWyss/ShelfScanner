# 001 — MVP spike: can models read a shelf and recommend from it?

Status: proposed
Date: 2026-09-02

## Why

`docs/scoping.md` lists four risks. Two of them decide whether the project is
viable at all:

1. Can an affordable off-the-shelf vision model reliably read titles off a
   phone photo of angled, partially occluded spines?
2. Can an affordable language model produce *specific* recommendations from a
   title list plus loose preferences, rather than generic ones?

Everything else in the scoping doc (UI, saved lists, feedback, book database
lookups, retention) is only worth building if the answer to both is yes. So the
first change answers those two questions and nothing else.

The other two risks are addressed as measurements, not features: invented
titles are counted against hand-labelled ground truth, and cost per scan is
logged per model call.

## What changes

A command-line script, run locally, that:

1. Uploads shelf photos and their hand-labelled titles to Supabase.
2. Runs a chosen vision model over a photo and logs the titles it extracted,
   scored against the labels.
3. Runs a chosen language model over an extraction plus a preferences file and
   logs five recommendations with reasons, scored for validity.
4. Prints a per-model comparison from the logged rows.

No UI. No web app. No agent framework, orchestration library, or evaluation
platform. All model calls go through OpenRouter for the duration of the spike
(D13), so there is one adapter, one API key, and models are swapped with a
flag.

### Out of scope, deliberately

- Matching extracted titles against a real book database (Open Library etc).
  The scoping doc includes this step, but it is not an unknown; it is a
  known-solvable lookup. Adding it now would blur the model comparison. In this
  spike, "does the title exist" is checked against the hand labels instead.
- Goodreads CSV import. Preferences are a hand-written JSON file.
- Saving, feedback, sessions, retention, deployment, latency work.
- Prompt iteration beyond one version per stage. If v1 fails, that is a
  finding; a second version becomes a follow-up change.
- Direct provider integration. The winning model gets its provider's own SDK
  in the change that builds the real pipeline, not here.

## Decisions

**D1. Two stages, logged separately.** Extraction and recommendation are
separate commands with separate log tables. The scoping doc wants latency and
cost per stage, and it lets a vision model from one provider be paired with a
language model from another.

**D2. Ground truth is hand-labelled titles per photo.** A title counts as
ground truth if a human can read it from the photo at full resolution. Titles a
human cannot read are not labelled and do not count as misses. A third
category, `partial`, holds titles that are only fragments in the frame (a
spine cut off at the edge, the bottom of a book on the shelf above) but which
a human who knows the book can still name. Series volumes are labelled by
volume name, not series name. Labels are committed to the repo; photos are
not (they may show private rooms). The storage bucket is private.

**D3. Matching is normalised fuzzy title match.** Lowercase, strip punctuation,
drop a subtitle after a colon, collapse whitespace, then accept a standard
library sequence-ratio of 0.85 or above. Author is requested from the model but
not used for matching. This avoids penalising harmless variance ("The Hobbit"
vs "Hobbit, The") while still catching invented titles. Threshold is a config
value, not a constant in code.

**D4. Three extraction metrics, invented counted separately.** Per photo:
titles found (recall against labels), titles missed, and titles invented
(extracted but matching no label). Invented is the worse failure per the
scoping doc, so it is never folded into precision alone. An extracted title
that matches a `partial` label counts as neither found nor invented; it is
logged but excluded from all three metrics, so a model is neither rewarded
nor punished for reading a sliver.

**D5. Recommendation validity is structural, then against labels.** Every
recommended title must match a title in the extraction it was given (hard
constraint, checked in code). Separately, the share that also match ground
truth is logged, so a hallucinated extraction feeding a "valid" recommendation
is visible.

**D6. Reason specificity is scored by hand.** A 1–3 rubric (1 generic, 2
references a stated preference, 3 references a preference and something
specific about the book) entered through a command and stored on the row.
No LLM-as-judge in this spike; the test set is small enough to read.

**D7. Images are downscaled before sending.** Phone photos are 3000–4000px on
the long edge. Default long edge 1568px, exposed as a flag so resolution can
be part of the comparison. Resized dimensions are logged.

**D8. Prompts are files, versioned by filename.** `prompts/extract_v1.md`,
`prompts/recommend_v1.md`. The filename is logged with every call. This is the
scoping doc's section 2 requirement, started now so it is never retrofitted.

**D9. JSON output requested in the prompt, parsed in code.** Native
structured-output features differ per provider and are not uniformly exposed
through OpenRouter, so the spike asks for a JSON object in the prompt and
parses the reply. Parse errors are logged as errors, not silently retried.
A model that cannot reliably return JSON on request is itself a finding.

**D10. Candidate models.** Two sizes from Anthropic plus one small model each
from OpenAI and Google, so the comparison spans providers as the scoping doc's
section 3 asks. Prices below are per million tokens, input/output, for
orientation only; the logged cost comes from OpenRouter's per-request
accounting (D13), so the config file holds model slugs, not prices. Anthropic
rates are current as of the tool reference cached 2026-06-24. The OpenAI and
Google rates come from third-party aggregators. Exact OpenRouter slugs are
confirmed in task 4 and recorded in the config.

| Model | Provider | Direct price, input / output | Role |
|---|---|---|---|
| Claude Haiku 4.5 | Anthropic | $1.00 / $5.00 | vision + text |
| Claude Sonnet 5 | Anthropic | $2.00 / $10.00 | vision + text |
| GPT-5 mini or current small model | OpenAI | ~$0.25 / $2.00 | vision + text |
| Gemini Flash-Lite or current Flash | Google | ~$0.10 / $0.40 | vision + text |
| Qwen current Flash (added 2026-09-02, task 4) | Alibaba | ~$0.15 / $0.47 | vision + text |

Slugs and OpenRouter prices as checked in task 4 are in `config/models.toml`;
the "current" OpenAI and Google models resolved to newer, pricier releases
than the orientation figures above.

Rough cost check against the $0.05/scan ceiling: a 1568px image is on the
order of 2,500 input tokens and an extraction is a few hundred output tokens;
a recommendation call is under 1,000 tokens each way. Even Sonnet 5 on both
stages lands near $0.02. Cost is therefore not the binding constraint for
this spike; quality is. The logged numbers will confirm or refute that.

**D11. Test set size.** Five photos, hand-labelled, 69 ground-truth titles in
total. They cover landscape and portrait, straight-on and slightly angled,
upright spines and horizontal stacks, old cloth spines with faded and Fraktur
type, library stickers over text, a plant partly in frame, and a run of five
near-identical series volumes. Small enough to label in an hour; varied
enough that a model passing on all of them is meaningful, though five photos
is thin and a strong result should be read as "worth continuing", not
"proven". The scoping doc's 100–300 test cases is the target for a later
evaluation change, not this spike.

**D12. Logging goes to Supabase tables, not local files.** The scoping doc
already puts photos in object storage and rows in the database. Logging runs
there from the start means the comparison query is a SQL query and nothing
needs migrating later. Row-level security is enabled with no policies; the
script uses the service key.

**D13. All model calls go through OpenRouter, for this spike only.** One
OpenAI-compatible HTTP endpoint, one API key, one adapter, and every candidate
model addressed by slug. This removes three SDK integrations from a
throwaway comparison. The adapter is a plain `httpx` POST rather than a
provider SDK, so there is nothing to unwind afterwards. Cost per call is taken
from the usage block OpenRouter returns when asked (`usage: {include: true}`),
which already includes its markup; tokens are logged alongside so direct-API
cost can be recomputed. Known trade-offs, accepted: a small fee on top of
provider prices, an extra network hop that makes latency numbers an upper
bound, and no access to provider-specific features such as native structured
outputs or prompt caching. Once a winner is chosen, the real pipeline uses
that provider's SDK directly; that is a later change.

## What gets built

Tables (in `supabase/migrations/`):

- `photos` — id, storage path, ground-truth titles, partial titles, notes
  about conditions, created at.
- `extractions` — id, photo id, provider, model, prompt version, image long
  edge, raw output, parsed titles, found / missed / invented counts and lists,
  latency ms, input and output tokens, cost usd, error, created at.
- `recommendations` — id, extraction id, provider, model, prompt version,
  preferences (as sent), raw output, parsed recommendations, count valid
  against extraction, count valid against ground truth, specificity scores,
  latency ms, tokens, cost usd, error, created at.

Bucket: `shelf-photos`, private.

Code (in `src/shelfscanner/`): storage access, image resize, one OpenRouter
adapter, extraction, recommendation, matching and metrics, a command-line
entry point. Prompts in `prompts/`. Labels in `data/labels/`. Local photos in
`data/photos/`, gitignored. Preferences in `data/prefs/`.

Commands, all via `uv run shelfscanner`:

- `photos sync` — upload photos, upsert labels.
- `extract --photo <id|all> --model <id> [--max-dim N] [--prompt name]`
- `recommend --extraction <id> --model <id> --prefs <file> [--prompt name]`
- `run --photo <id|all> --vision-model <id> --llm-model <id> --prefs <file>`
- `score --recommendation <id> --specificity 1 2 3 2 3`
- `report` — per-model aggregates for both stages.

New dependencies: `httpx`, `pillow`. New environment variable:
`OPENROUTER_API_KEY`.

## How we know it worked

The spike is done when the comparison matrix has been run (every vision
candidate over every photo; every language candidate over the best extraction
of each photo) and the results are written into this folder. The decision
criteria, judged on the best candidate per stage:

| Question | Pass |
|---|---|
| Vision reads spines | Median per-photo recall ≥ 0.80 and invented titles ≤ 1 per photo |
| Recommendations are valid | 5 of 5 match the extraction on every run; ≥ 4 of 5 match ground truth on median |
| Recommendations are specific | Mean specificity ≥ 2.0 on the rubric |
| Affordable | Best pair under $0.05 per scan |
| Fast enough | Extraction plus recommendation p50 under 15 s |

Failing a row is a legitimate outcome. It tells us which stage needs a
different model, a different prompt, or a different approach, and that becomes
change 002.

## Risks

- **Model slugs drift.** Mitigated by keeping them in one config file and
  logging the slug on every row.
- **OpenRouter routes to a different backend than expected.** OpenRouter may
  serve a model from several hosts. The response names the provider actually
  used; it is logged per call so an odd result can be traced.
- **Photos are sensitive.** Private bucket, local copies gitignored, no photos
  in this repo or in these docs. The phone writes GPS coordinates into EXIF;
  the upload step strips all EXIF before the file leaves the machine.
- **Labelling is subjective at the edges.** D2's "a human can read it" rule
  plus a notes field per photo. Disagreements go in the notes.
- **A five-photo set can flatter a model.** Accepted for a spike. Section 2
  of the scoping doc gets a proper test set in a later change.
