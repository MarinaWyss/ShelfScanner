## 0\. Project Summary

* *Problem:* When I go to the bookstore I can’t figure out what to buy unless I recognize a title. I need a way to know which books I will like without Googling each one.

* *Why it matters / impact:* Book recommendation doesn’t happen when I’m actually physically in a position to buy a book. The moment I am most likely to buy a book is the moment I have the least information. I would buy more books at bookstores if I knew which ones I’d like.

* *Proposed approach:* Phone photo of a shelf → vision model extracts the titles it can read from the spines → each title is matched against a real book database → a language model ranks and explains a short list against the user's stated preferences. Output is five books from that shelf, each with a reason, savable to a list.

* *Primary success metric:* The user saves at least one recommended book per scan.

* *Key risks / unknowns:*  
  * Can an affordable off-the-shelf vision model reliably read titles off a phone photo of angled, partially occluded spines?  
  * Can an affordable language model produce specific recommendations from a title list plus loose preferences, rather than generic ones?  
  * Hallucinated titles — books recommended that aren't on the shelf, or don't exist.  
  * Cost per scan if it gets popular.

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
| Latency (p50 / p99) | \~15s / \~25s per scan | Needs visible progress feedback, not a spinner. |
| Cost per request | target \< $0.05/scan | 1 vision call \+ 1 recommendation call \+ book lookups. |
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
  * Reason specificity: does the stated reason reference the user's actual preferences, or is it generic? (Rubric-scored.)  
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
*Describe the overall prompt strategy. How many distinct prompts does your system use? What roles do they play (system prompt, few-shot examples, templates, output parsers)?*

**Prompt Organization**   
*Describe how prompts are stored and versioned. Prompts should be treated as separate components — not hardcoded in application files.*

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
| Test set size | *e.g., 100–300 test cases* |
| Test set composition | *Cover different question types, difficulty levels, edge cases* |
| Metrics | *e.g., LLM-as-judge scores, BLEU/ROUGE, exact match, format compliance* |
| Evaluation tooling | *e.g., manual review, PromptLayer, Langfuse, Weights & Biases* |
| Update cadence | *How often is the test set refreshed with new failure patterns?* |

**Checklist**:

- [ ] Prompts are stored in separate versioned files, not hardcoded.  
- [ ] I have a structured test set with diverse cases and expected outputs/criteria.  
- [ ] I have a repeatable evaluation process for comparing prompt versions.  
- [ ] Prompt changes are tested against the evaluation set before deployment.  
- [ ] I have documented my prompt iteration history and key learnings.

## 3\. Model Selection & Evaluation

**Candidate Models**

| Model | Provider | Cost (input/output) | Latency (est.) | Quality Notes | License |
| :---- | :---- | :---- | :---- | :---- | :---- |
|  |  |  |  |  | *Ensure the license works for your use case* |
|  |  |  |  |  |  |

**Evaluation Approach**   
*Describe how you'll compare models. Run each candidate on the same test set and compare performance, cost, and latency using a consistent rubric.*

**Model Routing (if applicable)**   
*If using multiple models, describe the routing strategy. e.g., a cheap/fast model classifies query difficulty and routes simple queries to a small model and complex queries to a larger one.*

**Checklist**:

- [ ] I have tested at least 2–3 models from different providers/sizes on my test set.  
- [ ] I have compared performance, cost, and latency in a structured way.  
- [ ] I have ensured the model licenses are appropriate for my use case.  
- [ ] I have documented the rationale for my final model choice(s).  
- [ ] If using model routing, I have tested and documented the routing logic.

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

