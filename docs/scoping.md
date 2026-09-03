## 0. Project Summary

* *Problem:* When I go to the bookstore I can’t figure out what to buy unless I recognize a title. I need a way to know which books I will like without Googling each one.

* *Why it matters / impact:* Book recommendation doesn’t happen when I’m actually physically in a position to buy a book. The moment I am most likely to buy a book is the moment I have the least information. I would buy more books at bookstores if I knew which ones I’d like.

* *Proposed approach:* Phone photo of a shelf → vision model extracts the titles it can read from the spines → each title is matched against a real book database → a language model ranks and explains a short list against the user's stated preferences. Output is five books from that shelf, each with a reason, savable to a list.

* *Primary success metric:* The user saves at least one recommended book per scan.

* *Key risks / unknowns:*  
  * Can an affordable off-the-shelf vision model reliably read titles off a phone photo of angled, partially occluded spines? **Yes** (change 001): two models read five test shelves with recall 1.0 and zero invented titles, at under two cents a photo.  
  * Can an affordable language model produce specific recommendations from a title list plus loose preferences, rather than generic ones? **Yes, limited by the preferences** (change 001): every model stayed on the list; the best matched the user's own picks 4 of 5. Where it missed, the cause was taste the preferences file did not describe.  
  * Hallucinated titles — books recommended that aren't on the shelf, or don't exist. **A model property, not a prompt property** (change 001): one prompt gave zero invented titles on two models and up to seven per photo on three others. Managed by model choice first, book-database verification second.  
  * Cost per scan if it gets popular. **Not the binding constraint** (change 001): about one cent per scan. Latency is: the pair that reads well lands at the 15 s line, mostly reasoning tokens.  
  * *New:* model lock-in. The passing models are all under a year old; the failing ones were last year's best. The pipeline must make swapping a model a config change (see section 3).

**How this document is used**

This is the project-level why and what; `docs/changes/` is the same thing
per feature, and every proposal there starts from the constraints here.
Requirements in section 1 are written as testable behaviour because that
is what a spec requirement is, and `docs/specs/` is seeded from them.
Decisions about which model or library satisfies a requirement live in
section 3, section 6 and the decision log in the appendix, and in the
change proposals. Behaviour and decisions change at different rates and
for different reasons, so they are kept apart. This is the current plan,
revised after each change lands, not a blueprint.

## 1. Problem Framing & Success Metrics

**Business / User Problem**   
*Who is the user?* Someone who reads regularly and browses physical shelves  (e.g. bookstores, libraries, used shops, or friends’ collections). 

*What's the pain point?* Recognition failure at the point of decision. Existing tools solve adjacent problems: Google Lens identifies one book at a time and tells you nothing about whether *you* would like it. Goodreads and StoryGraph know your taste but can't see the shelf. Nothing takes "here is what is physically in front of me" as input.

**Goal**   
A user standing at a shelf takes one photo, and within roughly fifteen seconds  
gets five books that are actually on that shelf, each with a reason that  
references something real about their taste, and can save the ones they want. "Solved" means they save at least one, and the reasons are specific enough that  
they'd have been annoyed to miss the book.

**Stakeholders**   
Me, potentially future users.

**Prior Work**   
ShelfScanner v1 is live at shelfscanner.io, but it was made fast and kinda sloppy.

**Input and Output**

* Input:  
  * One phone photo of a shelf of books, taken by a standing user in variable light.  
  * The user's preferences: a few genre picks at minimum, optionally a Goodreads CSV export.  
* Output:  
  * A short list (target: five) of books *drawn only from that photo*, each with a one-or-two-sentence reason tied to the user's stated preferences.  
  * The ability to save any of them to a list.  
  * A way to say a recommendation was bad.  
* Storage:

| Item | Kind of data | Where to store |
| :---- | :---- | :---- |
| Shelf photos | Files, \~1–3 MB each | Object storage |
| User preferences | Rows | Database |
| Book metadata / lookups | Rows | Database |
| Saved lists | Rows | Database |
| Feedback | Rows | Database |
| Identity | No accounts — device-scoped session | Database |

**Scope for v1**

In: the five boxes in the appendix diagram. Upload, spine extraction, book
lookup, recommendation, and feedback with a saved list, behind a device
session with no account.

Out of scope for v1, deliberately:

* Purchase links. The output is a list to carry to the till, not a shop.
* Multi-language support beyond what the vision model reads unaided. The
  test shelves already contain German titles and Fraktur spines and the
  chosen models read them; there is no translation step and no
  per-language prompt.
* Accounts. Nothing in the primary metric needs one.

Deferred at first, both since decided by a number:

* **Caching of book lookups.** The rule was: build it if lookups add more
  than 3 s p50 to a scan. Change 007 measured 4.5 s, so change 008 built
  `lookup_cache`; a repeated shelf now verifies in about 0.3 s
  (`docs/specs/book-lookup.md`, "Cache").
* **Photo retention.** Thirty days for session photos, never for the test
  set (008 D2); a daily job deletes the object and keeps the row.

**Constraints**

The targets from the first draft, the numbers change 001 measured, and
what each constraint means now.

| Constraint | First-draft target | Measured (change 001) | Now |
| :---- | :---- | :---- | :---- |
| Latency (p50 / p99) | \~15 s / \~25 s per scan | 14.8 s p50 for Gemini 3.8 Flash \+ GPT-5.4 mini through OpenRouter; 13.2 s for Sonnet 5 \+ GPT-5.4 mini. Mostly reasoning tokens. | 15 s p50 for the whole scan, including upload and lookup. Change 002 aims for under 10 s for the two model calls to leave room for the rest. This is the binding constraint. Progress per stage, not a spinner. |
| Cost per scan | \< $0.05 | $0.0096 for the chosen pair; the whole 68-call spike cost $0.38. | Ceiling stays $0.05. Working assumption $0.02 with lookups. Cost is not what limits the design. |
| Quality bar | Zero invented titles. | Two models: zero invented over five photos. Three others: 1.4 to 6.8 per photo on the same prompt. | Requirement E1 below. Model choice is the first defence, the book lookup the second. |
| Privacy | No accounts, no PII. | EXIF, including the phone's GPS block, is stripped before upload; bucket is private; photos never enter the repo. | Unchanged. Session photos are deleted after thirty days (change 008). |
| Availability | Best effort. No SLA. | Not measured. | Unchanged. |

**Requirements**

Written as behaviour so each one can become a spec requirement with a
scenario. Which model or library satisfies it is a decision and lives in
section 3, section 6 and the appendix, not here. A tick means the
behaviour is true today and has a spec.

*Upload*

- [x] U1. A photo leaves the device with no EXIF or XMP. Given a phone
  JPEG with a GPS block, when it is uploaded, then the stored object has
  no metadata. (`docs/specs/photo-storage.md`)
- [x] U2. The vision model receives an image with a long edge of at most
  1568 px; the dimensions sent are logged. (`docs/specs/extraction.md`)

*Spine extraction*

- [x] E1. The system must not report a title that is not visible in the
  photo. Given a photo with hand-labelled titles, when extraction runs,
  then every returned title matches a label. Pass line on the test set:
  median recall at least 0.95 and zero invented titles per photo for the
  model in use. (`docs/specs/extraction.md`) Ticked on change 001's rows
  for Gemini 3.8 Flash through OpenRouter; the direct adapter has not run
  for want of a key, and the sourced and degraded sets (006) show every
  model inventing on hard input, which is why L1 verifies.
- [x] E2. A truncated or unparseable reply is recorded as an error and
  never presented as an empty shelf. (`docs/specs/extraction.md`)

*Book lookup*

- [x] L1. Every title the user sees resolves to a catalogue record whose
  title matches what was read closely enough. Given an extraction
  containing a string that no record matches at the threshold, when
  recommendations are produced, then that string is not among the picks
  and the drop is logged. (Refined by change 006: an invented title can
  be a real book that is not on the shelf, so existence alone proves
  nothing; the match to the read string is the check.)
- [ ] L2. A matched record carries at least author and a canonical title;
  the pick is shown with those, not with the model's transcription.
- [x] Decided (007 D2): when the lookup service is unavailable the scan
  completes with every title kept as read and marked unverified; a
  catalogue failure is never a failed scan. (`docs/specs/book-lookup.md`)

*Recommendation*

- [x] R1. Every recommendation is a book from that photo. Given the list
  the model was handed (today the extraction; after change 007,
  the verified records), when it returns picks, then each pick matches a
  title on that list, checked in code with the same matcher as
  extraction. A reply that fails the check is logged with an error and
  not shown. (`docs/specs/recommendation.md`)
- [x] R2. A scan returns exactly five picks, or every book if fewer than
  five were read. (`docs/specs/recommendation.md`)
- [x] R3. Each pick has a reason that names a stated preference and
  something specific about the book. Measured as overlap with the user's
  own picks on the test set: median at least 3 of 5.
  (`docs/specs/recommendation.md`)
- [x] R4. Preferences are at minimum a set of genre picks and at most a
  Goodreads export. Given a Goodreads CSV, when it is imported, then the
  books the user rated become part of what the model is given, and the
  raw file is not kept. (`docs/specs/preferences.md`)

*Feedback and saved list*

- [x] F1. A user can save any pick. Saved picks persist for that device
  and survive a reload. (`docs/specs/feedback.md`)
- [x] F2. A user can mark a pick bad. The mark is stored against the
  recommendation row that produced it. (`docs/specs/feedback.md`)
- [x] F3. A session is a device token, generated on first use. Nothing
  stored links a token to a person. (`docs/specs/web.md`, "Sessions")

*Whole scan*

- [ ] S1. A scan completes in 15 s p50 and the user sees which stage is
  running. The stages show (`docs/specs/web.md`); the time is not yet met:
  16.7 s p50 on the laptop on 2026-09-03 with both primaries on their
  fallbacks and a cold catalogue check. Phone numbers on the primaries
  pending (003 and 005 results).
- [x] S2. Every model call is logged with model, prompt version, tokens,
  cost, latency, provider and any error, so any result can be traced to
  the exact inputs. (`docs/specs/run-logging.md`)

**Success Metrics**  
*Define metrics at three levels:*

* *User-facing metrics:*   
  * Primary metric \= save rate: % of scans where at least one recommended book is saved.   
  * Thumbs-up rate per recommendation.  
  * Scan completion rate: % of started scans that reach a result without the user abandoning.  
* *Technical metrics:*   
  * Titles correctly extracted per photo (against hand-labelled ground truth).  
  * Titles missed per photo.  
  * Invented titles per photo: Counted separately from misses, because it's a different and worse failure.  
  * Recommendation validity: % of recommendations that correspond to a book actually visible in the photo.  
  * Recommendation overlap: how many of the five picks match the books the user would have chosen from that shelf. (Replaced a rubric on reason wording in change 001; the rubric command remains but is unused.)  
* *System metrics:*  
  * Latency p50 / p95, per pipeline stage — extraction and recommendation measured separately, so it's clear which one is slow.  
  * Cost per scan, broken down by stage.  
  * Error rate, split into model failures vs. application failures.  
  * Uptime.

**Checklist**:

- [x] I have strong evidence that the problem I'm trying to solve is an important problem to solve.  
- [x] I have strong evidence that an LLM-based approach is the right tool for this problem (vs. traditional software, rule-based, or classical ML).  
- [x] The goals and metrics align with user needs and/or team priorities.  
- [ ] I have shared the scope with relevant stakeholders and flagged dependencies. \<- just me\!  
- [x] I have documented key decisions and trade-offs in my README or decision log.

## 2\. Prompt Engineering & Systematic Tracking

**Prompt Architecture**   
Two prompts, one per stage, both plain instruction text sent as the user
message with the input (an image, or the shelf list plus preferences JSON)
appended. No system prompt, no few-shot examples. Both ask for a JSON object
that is parsed in code; native structured output is not used while calls go
through OpenRouter (change 001, D9).

**Prompt Organization**   
`prompts/extract_v1.md`, `prompts/recommend_v1.md`, `recommend_v2.md`
(change 004: takes the rated books) and `recommend_v3.md` (004 task 4:
the shelf list after the preferences; the default). The filename is the version and is logged on every row, so
any result can be traced to the exact prompt text. A new version is a new
file; old ones stay. The directory is flat because there are four
prompts; the structure below is the target if that grows.

**Example structure:**

```
prompts/
  ├── system_prompts/
  │   ├── assistant_v1.txt
  │   ├── assistant_v2.txt
  │   └── summarizer_v1.txt
  ├── few_shot_examples/
  │   ├── classification_examples.json
  │   └── query_reformulation_examples.json
  └── templates/
      └── rag_response_template.txt
```

**Evaluation Framework**   
*Describe your test set and evaluation approach for prompts.*

| Evaluation Aspect | Approach |
| :---- | :---- |
| Test set size | 64 photos (change 006): the 5 core photos with 69 hand-labelled titles plus 10 partial labels (change 001), 20 degraded copies of them (blur, glare, rotation, small), and 39 sourced from Wikimedia Commons with 1,677 labelled titles. Target: 100–300 photos, real phone scans replacing the sourced ones over time. |
| Test set composition | Landscape and portrait; straight-on and angled; upright spines and horizontal stacks; Fraktur and faded cloth spines; library stickers; a plant in frame; a run of five near-identical series volumes. |
| Metrics | Extraction: recall, missed, invented (kept separate) against labels via normalised fuzzy match at 0.85. Recommendation: valid against the extraction (hard), valid against labels, overlap with the user's own five picks for the shelf. Plus cost and latency per stage. |
| Evaluation tooling | The CLI logs every call to Supabase; `research/` holds the matrix drivers and the text and visual reports that aggregate them. No LLM-as-judge; the set is small enough to read. |
| Update cadence | Not yet. The test set grows in change 006 from openly licensed shelf photos and degraded copies of the five. |

**Checklist**:

- [x] Prompts are stored in separate versioned files, not hardcoded.  
- [x] I have a structured test set with diverse cases and expected outputs/criteria.  
- [x] I have a repeatable evaluation process for comparing prompt versions.  
- [x] Prompt changes are tested against the evaluation set before deployment. \<- `recommend_v2` was scored against v1 on the core set before becoming the default (004 results); the nightly job and `research.check` gate the rest  
- [x] I have documented my prompt iteration history and key learnings. \<- `prompts/` keeps every version; 001 and 004 results record what each changed and why

## 3\. Model Selection & Evaluation

**Candidate Models**

Measured in change 001 on the five-photo test set, all calls through
OpenRouter (so latency is an upper bound). Cost is per photo for reading and
per run for choosing, as reported by OpenRouter. Full tables in
`docs/changes/archive/001-mvp/results.md`.

| Model | Provider | Cost (input/output, $/M) | Latency (p50, read / choose) | Quality Notes | License |
| :---- | :---- | :---- | :---- | :---- | :---- |
| Claude Sonnet 5 | Anthropic | 2.00 / 10.00 | 10.0 s / 11.8 s | Reads shelves perfectly, zero invented. $0.015 a photo. Slow for both stages, mostly reasoning tokens. | API terms |
| Gemini 3.8 Flash | Google | 0.75 / 3.75 | 11.6 s / 11.5 s | Same reading quality as Sonnet at half the cost ($0.008). Spends thousands of reasoning tokens; untested at lower effort. | API terms |
| GPT-5.4 mini | OpenAI | 0.75 / 4.50 | 2.3 s / 3.2 s | Fastest. Invents 2.6 titles per photo, so not usable for reading. Fine at choosing. | API terms |
| Qwen 3.8 Flash | Alibaba | 0.15 / 0.47 | 6.1 s / 4.8 s | With reasoning off, recall 0.89 but 1.4 invented per photo. Cheapest by far; valid on every recommendation run. | API terms |
| Claude Haiku 4.5 | Anthropic | 1.00 / 5.00 | 4.6 s / 4.2 s | Recall 0.42 with 6.8 invented per photo. Not usable for reading. Fine at choosing. | API terms |

**Evaluation Approach**   
Every candidate over every photo at 1568 px, scored against labels; the best
candidate again at 2400 px. Every candidate over the best extraction of each
photo with the same preferences file, checked for validity and hand-scored
for specificity. One adapter and one prompt version per stage, so the only
variable is the model.

**Chosen Models**

One model per stage, each with a fallback that passed the same test. A
swap is a config edit plus a rerun of the five photos through the report
(change 002, D6). Full reasoning in
`docs/changes/archive/001-mvp/results.md`.

| Stage | Model | Why | Fallback |
| :---- | :---- | :---- | :---- |
| Reading spines | Gemini 3.8 Flash | Equal to Sonnet 5 on recall (1.00) and invented titles (0) at half the cost, $0.008 a photo. First experiment in change 002 is the same model at low reasoning effort. | Claude Sonnet 5. Same reading quality, $0.015 a photo, if Gemini's quality does not survive lower effort or direct SDK structured output. |
| Choosing five | GPT-5.4 mini | Best overlap with the user's own picks (median 4 of 5), three seconds, a fifth of a cent a run. | Claude Haiku 4.5, direct. Qwen 3.8 Flash was the choice (same median overlap, cheapest) until 2026-09-03, when OpenRouter's shared pool rate-limited it on two real scans (002). |

The models that failed reading (Haiku 4.5, GPT-5.4 mini) are fine for
choosing; the models that read best are slower and no better at choosing.
That is why the stages are split and chosen separately.

**Model Routing (if applicable)**   
No routing by request difficulty. Two models, one per stage, chosen
independently: the reading stage needs a model that does not invent (Gemini
3.8 Flash or Sonnet 5); the choosing stage can use a small model because,
given a clean list, every candidate was valid on every run.

What the system does need is a **router of its own** so the model behind
each stage can change without touching pipeline code. The spike showed why:
the models that passed did not exist eighteen months ago, and the comparison
was only cheap because every model was a config entry behind one adapter.
The production shape, decided in change 002:

* One `ModelClient` interface per stage (vision call, text call) with the
  same result shape the spike logs today: raw text, parsed JSON, tokens,
  reasoning tokens, cost, latency, finish reason, provider.
* One adapter per provider behind it (Google, OpenAI, Anthropic to start),
  using the provider's own SDK for native structured output and reasoning
  controls.
* `config/models.toml` names which model serves each stage, with its
  reasoning setting, image size and price. Changing a model is a config
  edit plus a rerun of the test set through `report`.
* Every call logs the model and prompt version, as now, so a swap is
  visible in the data and reversible.

Retest cadence: rerun the matrix when a provider ships a new model in the
tier in use, or quarterly, whichever comes first.

**Checklist**:

- [x] I have tested at least 2–3 models from different providers/sizes on my test set.  
- [x] I have compared performance, cost, and latency in a structured way.  
- [x] I have ensured the model licenses are appropriate for my use case. \<- hosted APIs under their standard terms  
- [x] I have documented the rationale for my final model choice(s).  
- [x] If using model routing, I have tested and documented the routing logic. \<- `docs/specs/model-router.md`; `tests/test_router.py`, `tests/test_failover.py`

## 4\. RAG Implementation

Not used. The book-database step is a keyed lookup (title and author from
the extraction, matched against a catalogue such as Open Library), not
retrieval over chunks, so there is nothing to chunk, embed or rank. It is
specified as requirement L1 and built in its own change.

The one place retrieval could appear is preferences. A Goodreads export
with a few hundred rated books fits in the recommendation prompt; one with
thousands does not. If that limit is hit, selecting the rows of the user's
history most relevant to the titles on the shelf becomes a retrieval
question, and this section gets filled in then, from measurements, not
assumption.

**Checklist**: not applicable.

## 5\. Agent Systems

Not used. The pipeline is a fixed sequence of two model calls with one
lookup between them, and every step is one request. There is nothing to
decide at runtime that a tool-calling loop would decide better, and each
extra round trip costs seconds in a system whose binding constraint is
latency. If a step later needs a retry or a second opinion, that is a
branch in the pipeline, not an agent.

The robustness questions still apply to a fixed pipeline:

| Concern | Approach |
| :---- | :---- |
| Error handling | Every call produces a logged row even when it fails, with the error set and a truncated reply distinguished from an unparseable one. The direct SDKs retry transport and 5xx errors once or twice (Google one retry, OpenAI and Anthropic their default two); past that the router fails over once to the stage's fallback (002 D8). The OpenRouter adapter retries nothing. The scan reports which stage failed. |
| Security | The Supabase service key never leaves the server. The photo bucket is private and nothing grants read access. Uploads are capped at 20 MiB and limited to JPEG and PNG. No PII is stored; sessions are device tokens. |
| Runaway prevention | Fixed step count. Every call carries an explicit output cap and, per stage, an explicit reasoning setting (change 002, D4), because the spike showed a default reasoning budget can consume the whole reply. |
| Guardrails | Model output is validated in code, never trusted: extracted titles are verified against the book database (L1), picks are checked against the list the model was given (R1), and the count is checked (R2). |
| Cost monitoring | Cost per call is logged and reported per stage, and on the dashboard (009). The app refuses scans past ten per device per hour and past $5 of app spend per UTC day (008); the CLI has its own cap. |

**Checklist**: not applicable.

## 6\. Deployment & User Interface

Built in changes 003, 005, 008 and 009; deployment (010) is the part
still open. The tables below record what was decided; the specs in
`docs/specs/` describe the behaviour.

**API Design**

| Aspect | Approach |
| :---- | :---- |
| Framework | FastAPI wrapping the existing pipeline package, so the CLI and the app run the same code. Laid out for Vercel's Python runtime. |
| Streaming | Yes, progress per stage. The router interface from change 002 carries a progress callback for this. The user sees "reading the shelf", "checking titles", "choosing", not a spinner (S1). |
| Authentication | None. A device-scoped session token, issued on first visit and stored on the device (F3). |
| Rate limiting | Ten scans per device per rolling hour (429), and $5 of app spend per UTC day across every device (503); both from env (change 008). |
| Error handling | A failed stage is named to the user and logged with the error on its row. A failed recommendation does not hide a successful extraction. Nothing is invented to cover a gap. |

**User Interface**

| Aspect | Approach |
| :---- | :---- |
| UI framework | Server-rendered pages with htmx; the photo is resized on the phone before upload. Phone-first: the user is standing at a shelf. |
| Key interactions | A homepage that says what it does (012). Pick genres (the original's eighteen), name favorite authors, optionally upload a Goodreads export (R4). Take or choose a photo. Watch the stages complete. See five picks with reasons. Save any of them; mark any as bad. Open the saved list later on the same device. |
| Feedback mechanism | Save (the primary metric) and a per-pick "not for me" (F1, F2). Both are rows tied to the recommendation row that produced the pick, so feedback can be joined to the model, prompt version and preferences behind it. |

**Data**

Photos go in the bucket that already exists. Everything else is rows in
Postgres next to the tables the spike already writes.

| Data | Where | Status |
| :---- | :---- | :---- |
| Shelf photos | `shelf-photos` bucket, private | exists |
| Model calls, scored | `extractions`, `recommendations` | exists |
| Sessions | `sessions`, keyed by the token's SHA-256 | exists (003) |
| Preferences | `preferences`, one row per session, genres plus imported ratings | exists (004) |
| Book records | `books`, the records the lookups returned; `lookups` per scan; `lookup_cache` consulted before calling out (the caching decision, above) | exists (007, 008) |
| Saved picks, feedback | `saved`, `feedback`, referencing the recommendation row and pick index | exists (005) |

**Infrastructure**

| Aspect | Approach |
| :---- | :---- |
| Hosting | Supabase for the bucket and Postgres (in place). Vercel from GitHub for the app (change 010). |
| Containerization | None. Vercel builds from the repo. |
| CI/CD | GitHub Actions runs tests and lint on every push (change 002); Vercel deploys main and previews branches (change 010). |

**Checklist**:

- [x] My API handles streaming, errors, and rate limiting. \<- server-sent events per stage, named failures, 429 and 503 (003, 008)  
- [x] My UI is accessible and provides a way for users to give feedback. \<- save and "not for me" (005)  
- [ ] My application is containerized with Docker. \<- not applicable; Vercel builds from the repo  
- [x] I have CI/CD set up so tests run automatically on push. \<- GitHub Actions (002); deployment at 010  
- [x] I have a live demo link or clear setup instructions in my README. \<- setup instructions; no demo of this codebase yet

## 7\. System Monitoring & Error Analysis

**Component-Level Monitoring**

| Component | Metrics to Track |
| :---- | :---- |
| Upload | Photo size in, size sent to the model, metadata-strip failures. |
| Spine extraction | On the test set: recall, missed, invented, against labels. In use: titles per photo, truncation rate, parse-error rate, reasoning tokens, latency, cost. |
| Book lookup | Share of extracted titles that resolve, drops per scan (the second defence against invention), lookup latency, service errors. |
| Recommendation | Picks valid against the list (must be 100%), wrong-count errors, latency, cost. On the test set: overlap with the user's picks. |
| Feedback and saved list | Save rate per scan (the primary metric), "not for me" rate per pick, scan completion rate. |
| Overall system | Scan latency p50 and p95 by stage, cost per scan by stage, error rate split into model and application failures. |

**Logging**

| Logging Approach | Tool/Method |
| :---- | :---- |
| Basic | In place. Every model call is one row in Supabase (`extractions`, `recommendations`) with model, prompt version, provider, tokens, reasoning tokens, cost, latency, finish reason, raw output and any error. Rows are never deleted; a rerun adds a row. Change 002 adds provider request ids. |
| Advanced | None. `research/report` reads the rows and produces the text and visual reports. An observability product is not justified at this volume. |

Lookup, session, save and feedback rows join to the same tables, so a
saved book can be traced back to the exact extraction, prompt version and
preferences that produced it.

**Error Analysis Process**

Two loops, one per kind of change.

* *Before a change ships:* rerun the five-photo test set through the report
  and compare to the numbers in change 001's results. That report is the
  acceptance test for any model, prompt or adapter change (change 002, D6).
  A regression on recall, invented, overlap, latency or cost blocks the
  change.
* *In use:* read the error rows and the "not for me" rows, weekly at the
  volume expected. Sort each into model failure (invented title, truncated
  reply, wrong count) or application failure (upload, lookup, database).
  A model failure becomes a photo added to the test set with labels, so the
  set grows from real failures; a recurring one becomes a change proposal.

No alerting. Availability is best effort.

**Checklist**:

- [x] I have structured logging for every request.  
- [x] I track cost, latency, and quality metrics over time.  
- [x] I have a process for reviewing and categorizing errors. \<- `research.review` drafts it weekly; first review `docs/reviews/2026-09-03.md`  
- [x] I have a feedback loop: errors inform prompt/RAG/agent improvements. \<- the review's "Suggested change" becomes a proposal; a model failure becomes a labelled test photo  
- [ ] I have alerting for critical metric regressions (if applicable). \<- not applicable

## 8\. Fine-Tuning (Optional / Advanced)

Not planned. The MVP showed that off-the-shelf models pass both gates, that
the limiting input for recommendations is the preferences rather than the
model, and that models in this tier turn over within a year. A fine-tune
would be tuned to a model that is replaced before it pays back, and it would
need a labelled set far larger than the five photos that exist.

The case that would reopen this: needing a reading model cheaper than Gemini
3.8 Flash and finding no off-the-shelf one that stops inventing titles, with
a few hundred labelled photos in hand. The test-set change (section 10) is
what would make that possible.

**Checklist**: not applicable.

## 9\. Code Quality & Repository Structure

**Project Structure**

As it is today. New capabilities become modules in the pipeline package;
the service and the UI get top-level directories in the changes that create
them.

```
ShelfScanner/
├── config/models.toml       candidate models, per-stage choice (change 002), match threshold, image size
├── prompts/                 one file per prompt version; the filename is logged on every call
├── data/
│   ├── labels/              hand labels per photo (committed)
│   ├── photos/              photos (gitignored)
│   └── prefs/               preferences files and the user's own picks per photo
├── src/shelfscanner/        the pipeline: cli, settings, db, config, images, storage,
│                            adapter, matching, extract, recommend
├── research/                comparison tooling outside the pipeline: matrix drivers, reports
├── supabase/migrations/     schema, grants, constraints
├── tests/                   the pure pieces: metadata stripping, matching, validity, aggregation
├── docs/
│   ├── scoping.md           this document
│   ├── specs/               how the system behaves today, one file per capability
│   └── changes/             one folder per change: proposal, tasks, results; archive/ when done
├── .env.example
├── pyproject.toml           uv project; dependencies and the shelfscanner entry point
└── README.md
```

**Code Standards**

- [x] Type hints on all functions.  
- [ ] Docstrings on all functions (what it does, parameters, returns). \<- about a third; the specs carry the behaviour  
- [x] No hardcoded values — API keys, model names, chunk sizes in config/env vars. \<- keys in `.env`, models, threshold and image size in `config/models.toml`  
- [x] Modular code in .py files, not monolithic notebooks.

**README Contents**

- [x] Clear overview of problem and solution.  
- [x] Architecture diagram showing how components connect. \<- `docs/mvp-diagram.html` for the spike; the five-box target is in the appendix here  
- [x] Key decisions and trade-offs (what you tested, what you learned). \<- by pointer to the change proposals and results  
- [x] Setup instructions (clone → run).  
- [x] Performance metrics and evaluation results. \<- by pointer to `docs/changes/archive/001-mvp/results.md`  
- [ ] Live demo link (if deployed). \<- shelfscanner.io is the earlier v1, not this codebase

## 10\. Project Timeline & Milestones

Milestones are changes in `docs/changes/`; the roadmap, the waves of
parallel work, and the rules for running them unattended are in
`docs/changes/README.md`. A task starts when what it needs exists, not when
its phase begins, so the phases below overlap. Deadlines force the "what
can wait" decision; the order is revised after each change lands.

| Milestone | Change | Track | Deadline | Status |
| :---- | :---- | :---- | :---- | :---- |
| Problem scoping and design | this document | | | first draft, revised from the MVP on 2026-09-02 |
| MVP spike: can models read a shelf and recommend from it | 001 | | | done 2026-09-02 |
| Provider router, failover, CI and the regression gate | 002 | quality | 2026-09-09 | built 2026-09-03; primaries unmeasured for want of keys |
| App shell: photo to titles on a phone, over the local network | 003 | app | 2026-09-16 | built 2026-09-03; closes after the phone scans |
| Preferences: Goodreads export, prompt v2, overlap eval | 004 | quality | 2026-09-16 | done 2026-09-03 (prompt v3 came out of the eval) |
| Recommendations in the app, saved list, feedback | 005 | app | 2026-09-23 | built 2026-09-03; closes after the phone scans |
| Test set: sourced shelf photos, nightly eval, the lookup decision | 006 | quality | 2026-09-16 | built 2026-09-03; nightly job pending the repo secrets |
| Book lookup as verification (006 decided) | 007 | quality | 2026-09-23 | done 2026-09-03 |
| Hardening: limits, cost cap, retention, errors; caching if measured | 008 | app | 2026-09-23 | done 2026-09-03 |
| Monitoring: dashboard from the rows, weekly review | 009 | either | 2026-09-23 | built 2026-09-03; closes after the second weekly review |
| Deployment: Vercel from GitHub | 010 | app | 2026-09-30 | approved |
| Eval tooling: compare prompts, one eval command, promote a real scan | 011 | quality | 2026-09-03 | done 2026-09-03 |
| Homepage, the original's genres and favorite authors, the iOS scan button, a favicon | 012 | app | before the design segment | done 2026-09-03 |
| The v1 look and flow, copied | 014 | app | 2026-09-03 | done 2026-09-03 |
| The warm look on the v1 structure | 015 | app | 2026-09-03 | done 2026-09-03 |
| Dark/light toggle | 016 | app | 2026-09-03 | done 2026-09-03 |
| Donations, legal pages, contact | 013 | app | after 014 | done 2026-09-03 |

Fine-tuning and agents: not on the list (sections 5 and 8). Deployment is
last because it is the only phase that needs an account; until then the
phone reaches the laptop over the local network.

## 11\. Appendix

**Links**

* Specs: `docs/specs/` (photo storage, extraction, recommendation, run logging).
* Changes: `docs/changes/002-provider-router/`; archive in `docs/changes/archive/`.
* MVP results: `docs/changes/archive/001-mvp/results.md`; visual report `report.html` in the same folder.
* MVP pipeline diagram: `docs/mvp-diagram.html`. Target architecture: `docs/architecture.html` (the five boxes below, with status).
* Earlier v1, a different codebase: shelfscanner.io.

**Architecture**

Five boxes, all built: the first four run as CLI commands and as stages
of the web scan, the fifth lives in the web app (changes 003 to 008).

```
   ┌──────────┐    ┌──────────────┐    ┌──────────────┐    ┌────────────────┐    ┌──────────────────┐
   │  Upload  │───▶│ Spine        │───▶│ Book lookup  │───▶│ Recommendation │───▶│ Feedback and     │
   │  strip   │    │ extraction   │    │ title, author│    │ five picks,    │    │ saved list       │
   │  resize  │    │ vision model │    │ → real record│    │ language model │    │ save / not for me│
   └────┬─────┘    └──────┬───────┘    └──────┬───────┘    └───────┬────────┘    └────────┬─────────┘
        │                 │                   │                    ▲  │                    │
        ▼                 ▼                   ▼             prefs  │  ▼                    ▼
   shelf-photos       extractions        book records      (session) recommendations    saved, feedback
     bucket             table               table                       table              tables

                              one device session ties a scan's rows together; no account
```

**Glossary**

| Term | Meaning |
| :---- | :---- |
| Label | A title a person can read from the photo at full resolution. The ground truth for extraction. |
| Partial label | A fragment in frame that a reader who knows the book could still name. Excluded from all metrics. |
| Recall | Labels found over labels present, per photo. |
| Missed | A label no extracted title matched. |
| Invented | An extracted title that matches no label. Counted separately from misses because it is the worse failure. |
| Valid against extraction | A pick that matches a title the model was given. The hard constraint on recommendations. |
| Valid against ground truth | A pick that also matches a label, so a hallucinated extraction feeding a valid pick is visible. |
| Overlap | How many of a run's five picks match the five the user would have chosen from that shelf. The recommendation quality measure. |
| Reasoning tokens | Output tokens a model spends thinking before it answers. Dominate cost and latency for the models that read well. |
| Truncation | A reply cut off by the output cap, usually by reasoning. Logged as its own error, distinct from a parse failure. |
| Session | A device token. The only identity in the system. |

**Decision Log**

Decisions live in the change proposals; this is the index. A decision is
recorded where it was made, so the reasoning stays next to the evidence.

| Decision | Where |
| :---- | :---- |
| Two stages, logged and chosen separately | 001 D1; results |
| Ground truth is hand labels; partial labels excluded | 001 D2, D4 |
| Fuzzy title match at 0.85 over three forms of a title | 001 D3 |
| Invented titles counted apart from misses | 001 D4; this document, E1 |
| Recommendation quality is overlap with the user's own picks, not a wording rubric | 001 D6 as amended |
| Images sent at 1568 px; resolution is not a lever | 001 D7; results |
| Prompts are files versioned by filename, logged per call | 001 D8 |
| Logging goes to Supabase tables from day one | 001 D12 |
| OpenRouter for the spike only; provider SDKs for the pipeline | 001 D13; 002 D2 |
| Gemini 3.8 Flash reads, GPT-5.4 mini chooses; Sonnet 5 and Haiku 4.5 as fallbacks (Qwen 3.8 Flash until 2026-09-03) | 001 results; section 3; 002 |
| A router of our own, not a framework; models named in config | 002 D1; section 3 |
| Reasoning effort set per stage in config, never a provider default | 002 D4 |
| Cost computed from tokens and config prices with a checked-on date | 002 D5 |
| The five-photo report is the acceptance test for any model or prompt change | 002 D6 |
| Invention is a model property; the book lookup is verification, not the primary defence | 001 results; section 1 |
| Preferences, not the model, limit recommendation quality; richer capture before a stronger model | 001 results; change 004 |
| No RAG, no agents, no fine-tuning | sections 4, 5, 8 |
| No accounts; device-scoped session | section 1, F3 |
| Purchase links, translation, accounts out of v1; caching deferred behind a measured number | section 1 |
