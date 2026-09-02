# 001 — Results

Date: 2026-09-02. Rows in the `extractions` and `recommendations` tables;
the visual version is `report.html` (regenerate with
`uv run shelfscanner report --html docs/changes/archive/001-mvp/report.html`).

Test set: five photos, 69 labelled titles, 10 partial labels. Five models,
all via OpenRouter. Prompts `extract_v1.md` and `recommend_v1.md`. Images at
a 1568 px long edge unless stated. Total spend for the whole spike including
reruns and throwaway calls: about $0.38 over 68 model calls.

## Stage 1 — can a vision model read the spines?

Latest row per photo; errors counted separately.

| Model | Median recall | Invented / photo | Cost / photo | p50 latency | Errors | Verdict |
|---|---|---|---|---|---|---|
| Claude Sonnet 5 | 1.00 | 0.0 | $0.0147 | 10.0 s | 0 | pass |
| Claude Sonnet 5 @ 2400 px | 1.00 | 0.0 | $0.0162 | 8.4 s | 0 | pass |
| Gemini 3.8 Flash | 1.00 | 0.0 | $0.0076 | 11.6 s | 0 | pass |
| Qwen 3.8 Flash, reasoning off | 0.89 | 1.4 | $0.0004 | 6.1 s | 5 before reasoning was turned off | fail on invented |
| GPT-5.4 mini | 0.78 | 2.6 | $0.0025 | 2.3 s | 0 | fail |
| Claude Haiku 4.5 | 0.42 | 6.8 | $0.0035 | 4.6 s | 0 | fail |

Pass line: median recall ≥ 0.80 and ≤ 1 invented title per photo.

Per photo, found over labelled with invented in brackets:

| Model | Photo 1 (15) | Photo 2 (12) | Photo 3 (12) | Photo 4 (12) | Photo 5 (18) |
|---|---|---|---|---|---|
| Sonnet 5 | 15 (0) | 12 (0) | 10 (0) | 12 (0) | 18 (0) |
| Sonnet 5 @ 2400 | 13 (0) | 12 (0) | 12 (0) | 12 (0) | 18 (0) |
| Gemini 3.8 Flash | 15 (0) | 12 (0) | 12 (0) | 12 (0) | 15 (0) |
| Qwen 3.8 Flash | 13 (4) | 11 (1) | 10 (0) | 12 (0) | 16 (2) |
| GPT-5.4 mini | 11 (3) | 9 (4) | 10 (1) | 12 (0) | 14 (5) |
| Haiku 4.5 | 6 (7) | 5 (5) | 5 (4) | 4 (9) | 9 (9) |

Findings:

- **Two models read shelves essentially perfectly and never invent.** Sonnet
  5 and Gemini 3.8 Flash each missed a couple of titles on one photo and
  invented nothing across all five. Photo 1 includes Fraktur and faded cloth
  spines; photo 5 is a portrait shot of 18 books. Both handled them.
- **Resolution did not matter for Sonnet.** At 2400 px it traded two misses
  on photo 1 for two finds on photo 3. Same aggregate, slightly faster, ten
  percent dearer. 1568 px stays the default.
- **The cheap models invent.** GPT-5.4 mini is the fastest and one of the
  cheapest but returned 2.6 invented titles per photo. Haiku 4.5 is not
  usable for this: it misreads, hallucinates plausible titles ("The
  Alchemist", "The Rose Garden") and returns series names for volumes.
- **Reasoning budgets are a real failure mode.** Qwen 3.8 Flash at its
  default thought until it hit the 4096-token output cap on three of five
  photos and never wrote the JSON; "low" effort still failed two. With
  reasoning switched off it reads well (recall 0.89, cost a tenth of a cent)
  but still invents 1.4 per photo. Gemini 3.8 Flash has the same tendency:
  its cost and latency are mostly reasoning tokens (2,000–4,000 per photo).
  The adapter now distinguishes truncation from a parse failure and the
  config carries a per-model reasoning setting.
- **OpenRouter routed the Anthropic models to Amazon Bedrock and Claude
  Platform on AWS**, logged per call. Latencies are an upper bound.

## Stage 2 — can a language model choose well from the list?

Each model ran once over the best extraction of each photo (Sonnet's for
photos 1, 2 and 5; Gemini's for 3; GPT-5.4 mini's for 4; all with zero
invented titles) with Marina's preferences file. Overlap is how many of a
run's five picks match the books Marina herself would choose from that
shelf (D6 as amended). Photo 5 is excluded from the overlap columns: Marina
approved every book on it, so every model scores 5 there.

| Model | On the list | Real books among picks | Overlap, photos 1–4 | Median overlap, all five | Cost / run | p50 latency | Verdict |
|---|---|---|---|---|---|---|---|
| GPT-5.4 mini | 25 / 25 | 96% | 4, 2, 2, 4 (mean 3.0) | 4 | $0.0020 | 3.2 s | pass |
| Gemini 3.8 Flash | 25 / 25 | 96% | 3, 2, 2, 3 (mean 2.5) | 3 | $0.0081 | 11.5 s | pass |
| Qwen 3.8 Flash | 25 / 25 | 100% | 2, 3, 1, 4 (mean 2.5) | 3 | $0.0003 | 4.8 s | pass |
| Claude Haiku 4.5 | 25 / 25 | 96% | 4, 1, 1, 3 (mean 2.25) | 3 | $0.0025 | 4.2 s | pass, weakly |
| Claude Sonnet 5 | 25 / 25 | 96% | 2, 1, 2, 4 (mean 2.25) | 2 | $0.0129 | 11.8 s | fail on overlap |

Pass lines: 5 of 5 on the list every run; median ≥ 4 of 5 real; median
overlap ≥ 3 of 5.

Findings:

- **Every model met the hard constraint on every run.** Given a clean list,
  none invented a title. The one "not real" pick, shared by four models, was
  a partial-label title on photo 2 that the extraction had correctly read;
  it is a real book, just one the labelling rule excludes.
- **Taste match favours the small models.** GPT-5.4 mini matched Marina's
  picks best and is among the cheapest and fastest. Sonnet 5, the most
  expensive, matched least. Price buys reading accuracy in stage one; it
  buys nothing measurable in stage two.
- **The preferences file is the limiting input, not the model.** On photo 2
  Marina's picks were the history and politics titles (The Rise and Fall of
  Communism, How to Survive History, The New Middle East, Meditations, the
  German sagas). Every model picked Creativity, Inc. and four picked A
  People's History instead. The preferences file names science fiction,
  fantasy, psychology and self-help and says nothing about history, so the
  models were reasoning from "big-idea non-fiction" alone. No prompt change
  fixes missing information; the real pipeline needs richer preferences
  (the Goodreads export the scoping doc mentions) more than a better model.
- **Earlier evidence that validity matters:** Haiku's first run in task 6 on
  its own extraction of photo 4 recommended two hallucinated titles with
  confident reasons. Stage two is only as good as stage one.
- Sonnet and Gemini take ten seconds or more here, again mostly reasoning
  tokens. The three cheap models answer in three to five seconds.

## Against the proposal's criteria

| Question | Pass | Result | Verdict |
|---|---|---|---|
| Vision reads spines | median recall ≥ 0.80, invented ≤ 1 / photo | Sonnet 5 and Gemini 3.8 Flash: 1.00, 0.0 | **pass** |
| Recommendations are valid | 5 of 5 on the list; median ≥ 4 of 5 real | all five models: 25 / 25, median 5 | **pass** |
| Recommendations match the user | median overlap ≥ 3 of 5 (D6 as amended) | GPT-5.4 mini median 4; three others 3; Sonnet 2 | **pass** |
| Affordable | best pair < $0.05 / scan | Gemini + GPT-5.4 mini $0.0096 | **pass** |
| Fast enough | p50 under 15 s for both stages | Gemini + GPT-5.4 mini 14.8 s; Sonnet + GPT-5.4 mini 13.2 s | **pass, narrowly** |

Both questions the spike set out to answer are yes. Cost is not the binding
constraint, as the proposal expected; latency is closer than expected
because the two models that read well both spend seconds reasoning.

## Which provider won

**Gemini 3.8 Flash for reading, GPT-5.4 mini for choosing.** Gemini and
Claude Sonnet 5 are equal on reading quality and Gemini is half the cost;
Sonnet is the fallback if Gemini's quality does not survive a lower
reasoning setting. GPT-5.4 mini matched Marina's own picks best, answers in
three seconds and costs a fifth of a cent; Qwen 3.8 Flash is a cheaper
alternative with the same median overlap. A scan with this pair costs about
one cent and lands just under fifteen seconds through OpenRouter.

The next change replaces the OpenRouter adapter with the two providers' own
SDKs, which removes a network hop and opens their native structured output
and reasoning controls. The first thing to test there is Gemini with
reasoning effort lowered: if it keeps its reading quality, both the cost and
the latency margin widen considerably.

## What changes how the rest gets built

1. **Invention is a model property.** The same prompt produced zero invented
   titles from two models and two to seven per photo from three. Pick the
   model that does not invent; treat the book-database lookup as
   verification, not as the primary defence.
2. **Stage two is only as good as stage one.** All quality investment
   belongs upstream; a language model cannot detect a hallucinated input.
3. **Preferences are the limiting input for recommendations.** A few genres
   and a sentence under-describe taste; photo 2 showed it directly. Richer
   preference capture (Goodreads export, past saves) is worth more than a
   stronger model.
4. **Reasoning budgets are configuration.** Every call needs an explicit
   reasoning setting and a truncation check; reasoning tokens dominate both
   cost and latency for the models that reason.
5. **Latency, not cost, is the constraint.** A scan is fifty times under
   budget and right at the latency line. Direct SDKs, streamed progress and
   lower reasoning effort come before any UI work.
6. **The two stages want different models**, and the pipeline should be
   built around that split with each stage swappable.
7. **Resolution is not a lever.** 1568 px is enough; keep uploads small.
8. **The test set is thin.** Five photos of one person's shelves in decent
   light say "keep going", not "proven". Bookstore photos with glare and
   unfamiliar stock come before any UI.
9. **Do not lock in a model.** The candidates that passed did not exist
   eighteen months ago, and the ones that failed were the best available
   then. Every model in this spike was swapped with a config entry and a
   flag, and that is what made the comparison cheap. The real pipeline
   should keep that property: a thin router of our own, one adapter per
   provider behind it, models named in config, so a new release is a
   config change plus a rerun of the test set rather than a rewrite.

## Follow-ups worth a change of their own

1. Direct provider SDKs for Gemini and OpenAI; Gemini at low reasoning
   effort on the same five photos.
2. Richer preference input, starting with the Goodreads export.
3. A larger, more varied test set (the scoping doc's 100–300 target),
   including bookstore lighting and more angled shots.
4. Title lookup against a real book database, deliberately left out here.
