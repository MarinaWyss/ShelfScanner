# 011 — Eval tooling: compare prompts, one eval command, promote a real scan

Status: proposed 2026-09-03, for Marina's approval (a scope change to the
roadmap approved 2026-09-02). Kind: quality. Spend cap: $1.
Deadline: before the S8 video segment is recorded.

## Why

The evaluation practice exists (64 labelled photos, `research.matrix`,
`research.report`, `research.check` as a gate, nightly), but three things
it does are only doable by hand:

- Comparing two prompt versions with a number. The report groups rows by
  model and adapter; the v1/v2/v3 grid in change 004's results came from a
  throwaway script. "Change the prompt, rerun, compare" should be one
  command.
- Running the eval. It is two commands (`matrix`, then `check`) and the
  reader has to know both. One entry point with one PASS or FAIL at the
  end is easier to run, to put in a workflow, and to show.
- Growing the set from real failures. The weekly review says "add this
  photo to the test set with labels"; doing that today means downloading
  the object, copying it into `data/photos/`, writing a label file and
  syncing. A command that does it from a scan id closes the loop.

Section 7 of the scoping doc names the loop; this makes each step a
command.

## What changes

- `research.report --by-prompt [--set core]`: per prompt version, over the
  latest recommendation per photo and prompt for the configured choosing
  model: runs, picks on the list, overlap with Marina's picks per photo
  and the mean and median over photos 1 to 4, p50 latency, cost per run.
  The same numbers change 004's results table has, from the rows.
- `research.eval [--set core] [--reading alias] [--choosing alias]`: the
  primaries (or the aliases given) over the set through `matrix`, then
  `check` against the baseline; prints the check's verdict last and exits
  non-zero on a regression. The nightly workflow calls it instead of the
  three steps it runs today.
- `shelfscanner photos label <scan id> --titles "A" "B" ... [--partial ...]`:
  copies a session photo's object into the labelled set (a new `photos`
  row with `set = 'real'`, `titles` set, `source` recording the scan id
  and date; the object copied under `real/`), writes the label file under
  `data/labels/`, and leaves the session row alone so retention still
  applies to it. `matrix --set real` then runs over promoted scans. The
  photo keeps no session link: the label row is a test-set row like any
  sourced one.

### Out of scope

- An LLM-as-judge rubric. Overlap with the user's own picks stays the
  quality metric (001 D6 as amended); a judge is a separate proposal if
  overlap ever stops being available.
- A type-check step in CI.

## Decisions

**D1. Prompt comparison reads rows, it does not run anything.** The rows
from the matrix are the evidence; the comparison is a view over them, so
it costs nothing and can be run as often as wanted. Rerunning is
`matrix llm --prompt <name>`.

**D2. A promoted scan is a new labelled row, not a relabelled session
row.** Session photos are deleted after thirty days (008) and belong to a
device; a test-set photo is kept and has no session. Copying keeps the two
lifecycles apart and keeps `photos.session_id` meaning "an app scan".

**D3. `research.eval` is the nightly job's body.** One place to change
what "the eval" means; the workflow only supplies keys and the set.

## How we know it worked

| Question | Pass |
|---|---|
| Prompts compare | `report --by-prompt` on the core set reproduces change 004's grid for v1, v2 and v3 from the rows (a test on seeded rows, and the live numbers in results.md) |
| One command | `research.eval --set core` runs the primaries and ends with `research.check`'s verdict; the nightly workflow uses it |
| Real scans join the set | `photos label` on one of the lead's real scans produces a labelled row and a label file; `matrix vision --set real` runs over it |
| Nothing regressed | `research.check` passes; the suite passes |

## Risks

- `photos label` copies an object between bucket prefixes through the
  service key; a bug could delete or overwrite. Copy first, insert the row
  second, never delete; tests with a fake storage client.
