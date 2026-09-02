## 0\. Project Summary

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

## 1\. Problem Framing & Success Metrics

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

**Constraints**

| Constraint | Target | Notes |
| :---- | :---- | :---- |
| Latency (p50 / p99) | \~15s / \~25s per scan | Needs visible progress feedback, not a spinner. Change 001 measured 14.8 s p50 for the chosen pair through OpenRouter; this is the tight constraint. |
| Cost per request | target \< $0.05/scan | 1 vision call \+ 1 recommendation call \+ book lookups. Change 001 measured about $0.01 for the two model calls. |
| Quality bar | Zero invented titles. Every recommendation is traceable to a book visible in the photo. |  |
| Privacy / compliance | No accounts, no PII. Photos are user-uploaded and may incidentally contain people or private rooms. Retention policy needed. | Shelf photos could be more sensitive than they first appear. |
| Availability / uptime | Best-effort. No SLA. | I’ll do my best. |

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
`prompts/extract_v1.md` and `prompts/recommend_v1.md`. The filename is the
version and is logged on every row, so any result can be traced to the exact
prompt text. A new version is a new file; old ones stay. The directory is
flat because there are two prompts; the structure below is the target if
that grows.

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
| Test set size | 5 photos, 69 hand-labelled titles plus 10 partial labels (change 001). Target for a later change: 100–300 photos. |
| Test set composition | Landscape and portrait; straight-on and angled; upright spines and horizontal stacks; Fraktur and faded cloth spines; library stickers; a plant in frame; a run of five near-identical series volumes. |
| Metrics | Extraction: recall, missed, invented (kept separate) against labels via normalised fuzzy match at 0.85. Recommendation: valid against the extraction (hard), valid against labels, overlap with the user's own five picks for the shelf. Plus cost and latency per stage. |
| Evaluation tooling | The CLI logs every call to Supabase; `research/` holds the matrix drivers and the text and visual reports that aggregate them. No LLM-as-judge; the set is small enough to read. |
| Update cadence | Not yet. The test set grows in its own change once the bookstore photos exist. |

**Checklist**:

- [x] Prompts are stored in separate versioned files, not hardcoded.  
- [x] I have a structured test set with diverse cases and expected outputs/criteria.  
- [x] I have a repeatable evaluation process for comparing prompt versions.  
- [ ] Prompt changes are tested against the evaluation set before deployment. \<- one version so far  
- [ ] I have documented my prompt iteration history and key learnings. \<- one version so far

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
- [ ] If using model routing, I have tested and documented the routing logic. \<- no routing

## 4\. RAG Implementation

*Skip this section if your project does not use RAG.*

**Data Sources**

| Source | Type | Volume | Update Frequency | Notes |
| :---- | :---- | :---- | :---- | :---- |
|  |  |  |  |  |

**Chunking Strategy**

| Strategy Tested | Chunk Size | Overlap | Retrieval Accuracy | Notes |
| :---- | :---- | :---- | :---- | :---- |
|  |  |  |  |  |

*Test multiple strategies (fixed-size, semantic, recursive, etc.) on your specific data and measure retrieval accuracy.*

**Embedding Model & Vector Store**

| Component | Choice | Rationale |
| :---- | :---- | :---- |
| Embedding model | *e.g., OpenAI text-embedding-3-small, Sentence Transformers* |  |
| Vector store | *e.g., ChromaDB, FAISS, Pinecone, Weaviate* |  |

**Retrieval Strategy**   
*Describe the search approach: semantic similarity, hybrid search (keyword \+ semantic), re-ranking, query expansion, etc. Document what you tested and the improvement each technique provided.*

**RAG Evaluation**

| Metric | Description | Baseline | Current |
| :---- | :---- | :---- | :---- |
| Retrieval accuracy (Precision@K) | % of retrieved chunks that are relevant |  |  |
| Retrieval recall (Recall@K) | % of relevant chunks retrieved |  |  |
| Answer accuracy (given good chunks) | Does the LLM produce correct answers with correct context? |  |  |
| End-to-end accuracy | Does the whole system produce correct answers? |  |  |

**Checklist**:

- [ ] I have tested multiple chunking strategies and documented results.  
- [ ] I have evaluated at least two embedding models.  
- [ ] I have a retrieval test set (20–30+ questions with known answer locations).  
- [ ] I can isolate whether failures come from retrieval or generation.  
- [ ] I have documented the improvement from each retrieval enhancement (re-ranking, hybrid search, query expansion, etc.).

## 5\. Agent Systems

*Skip this section if your project does not use agents.*

**Agent Architecture**   
*Describe the agent's purpose, the framework used (LangGraph, CrewAI, custom function calling, etc.), and the high-level control flow.*

**Tools**

| Tool | Purpose | Input / Output | Error Handling |
| :---- | :---- | :---- | :---- |
|  |  |  |  |

**Safety & Robustness**

| Concern | Approach |  |
| :---- | :---- | :---- |
| Error handling | *What happens when a tool call fails? Retry? Fallback? Graceful error message?* |  |
| Security | *Input validation, sandboxed execution, access control* |  |
| Infinite loop prevention | *Max iterations, loop detection, cost budgets* |  |
| Guardrails | *Content filtering, output validation, human-in-the-loop for high-stakes actions* |  |
| Cost monitoring |  | *Ensure the agents don’t bankrupt you 🙂* |

**Agent Evaluation**

| Test Type | \# Tests | Description |
| :---- | :---- | :---- |
| Unit tests (individual tools) |  |  |
| Integration tests (complete workflows) |  |  |
| Adversarial tests |  |  |
| Representative task suite |  | *Simple to complex tasks; measure task completion rate, avg steps to completion* |

**Checklist**:

- [ ] Each tool has unit tests and documented input/output contracts.  
- [ ] I have explicit error handling for all tool failures.  
- [ ] I have safeguards against infinite loops and runaway costs.  
- [ ] I have a representative task test suite with measured completion rates.  
- [ ] I have logged and analyzed agent traces to identify failure patterns.

## 6\. Deployment & User Interface

**API Design**

| Aspect | Approach |
| :---- | :---- |
| Framework | *e.g., FastAPI, Flask* |
| Streaming | *Yes/No — important for perceived latency with LLM calls* |
| Authentication | *e.g., API key, OAuth* |
| Rate limiting | *Approach to prevent abuse* |
| Error handling | *How API failures (LLM timeouts, rate limits) are surfaced* |

**User Interface**

| Aspect | Approach |
| :---- | :---- |
| UI framework | *e.g., Streamlit, Gradio, React/Next.js* |
| Key interactions | *What can the user do? What does the flow look like?* |
| Feedback mechanism | *e.g., thumbs up/down, report bad responses* |

**Infrastructure**

| Aspect | Approach |
| :---- | :---- |
| Hosting | *e.g., AWS, GCP, Azure* |
| Containerization | *e.g., Docker* |
| CI/CD | *e.g., GitHub Actions — auto-test and deploy on push* |

**Checklist**:

- [ ] My API handles streaming, errors, and rate limiting.  
- [ ] My UI is accessible and provides a way for users to give feedback.  
- [ ] My application is containerized with Docker.  
- [ ] I have CI/CD set up so tests run automatically on push.  
- [ ] I have a live demo link or clear setup instructions in my README.

## 7\. System Monitoring & Error Analysis

**Component-Level Monitoring**

| Component | Metrics to Track |
| :---- | :---- |
| Prompts | Response quality scores, format compliance, refusal rate, avg response length |
| RAG | Retrieval confidence scores, \# chunks retrieved, source diversity, retrieval latency |
| Agents | Task completion rate, avg steps to completion, tool success rates, error types, cost per task |
| Overall system | End-to-end success rate, user satisfaction, latency, cost per request, error rate, uptime |

**Logging**   
*At minimum, log for each request: timestamp, user query, components used (which chunks retrieved, which model, which prompt version), response, latency, cost, and any errors.*

| Logging Approach | Tool/Method |
| :---- | :---- |
| Basic | *File or SQLite database* |
| Advanced | *e.g., Langfuse, LangSmith, Weights & Biases, custom observability stack* |

**Error Analysis Process**   
*Describe how you regularly review failures, categorize error types, and feed learnings back into improving prompts, RAG configuration, or agent logic.*

**Checklist**:

- [ ] I have structured logging for every request.  
- [ ] I track cost, latency, and quality metrics over time.  
- [ ] I have a process for reviewing and categorizing errors.  
- [ ] I have a feedback loop: errors inform prompt/RAG/agent improvements.  
- [ ] I have alerting for critical metric regressions (if applicable).

## 8\. Fine-Tuning (Optional / Advanced)

*Only pursue fine-tuning if you've optimized everything else and have a clear reason.*

**Use Case for Fine-Tuning**   
*Why fine-tuning is appropriate here (e.g., consistent output formatting, matching a larger model's performance with a smaller model, domain-specific language, embedding model tuning for RAG).*

**Approach**

| Aspect | Details |
| :---- | :---- |
| Training data | *\# examples, how they were created, quality assurance* |
| Base model | *Which model are you fine-tuning? Why this model?* |
| Baseline | *Performance of best prompt-only approach on held-out test set* |
| Versions trained | *Different data sizes, epochs, learning rates* |
| Performance comparison | *Does fine-tuned model beat baseline? By how much?* |

**Checklist**:

- [ ] I have exhausted prompt engineering and RAG optimizations before resorting to fine-tuning.  
- [ ] I have a high-quality training dataset (100–500+ examples).  
- [ ] I have a baseline to compare against.  
- [ ] I have trained multiple versions and tracked results.  
- [ ] I have documented whether fine-tuning was worth the effort.

## 9\. Code Quality & Repository Structure

**Project Structure**

```
your-project/
├── src/
│   ├── prompts/           # Prompt templates and versions
│   ├── rag/               # RAG components (chunking, retrieval, indexing)
│   ├── agents/            # Agent logic and tools
│   ├── models/            # Model selection and evaluation
│   └── monitoring/        # Logging and metrics
├── api/                   # FastAPI application
├── frontend/              # UI code
├── tests/                 # Unit and integration tests
├── evaluation/            # Test sets and evaluation scripts
├── data/                  # Sample data or data configs
├── deployment/            # Docker, cloud config files
├── docs/                  # Architecture diagrams, decision log
├── .env.example           # Example environment variables
├── requirements.txt       # Dependencies
├── Dockerfile
└── README.md
```

**Code Standards**

- [ ] Type hints on all functions.  
- [ ] Docstrings on all functions (what it does, parameters, returns).  
- [ ] No hardcoded values — API keys, model names, chunk sizes in config/env vars.  
- [ ] Modular code in .py files, not monolithic notebooks.

**README Contents**

- [ ] Clear overview of problem and solution.  
- [ ] Architecture diagram showing how components connect.  
- [ ] Key decisions and trade-offs (what you tested, what you learned).  
- [ ] Setup instructions (clone → run).  
- [ ] Performance metrics and evaluation results.  
- [ ] Live demo link (if deployed).

## 10\. Project Timeline & Milestones

| Milestone | Target Date | Status |
| :---- | :---- | :---- |
| Problem scoping & design complete |  |  |
| Prompt engineering baseline |  |  |
| RAG pipeline v1 |  |  |
| Agent system v1 (if applicable) |  |  |
| Evaluation framework complete |  |  |
| Deployment & UI |  |  |
| Monitoring & observability |  |  |
| Fine-tuning experiments (if applicable) |  |  |
| Final polish, README, demo |  |  |

## 11\. Appendix

* *Links to repos, notebooks, dashboards, evaluation results, etc.*  
* *Architecture diagram(s)*  
* *Glossary of terms/metrics*  
* *Decision log — key choices made and why*

