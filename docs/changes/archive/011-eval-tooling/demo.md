# S8 demo: the commands, in order, and what each shows

Every command below was run on 2026-09-03 and its output is in
`results.md`. Run them again before recording; the numbers move a little
(latency, cost), the shapes do not. Spend for the whole sequence is under
$0.20. Terminal at 100 columns; the tables are wide.

## 1. The software tests (screenshot: the tree and the CI file)

```
tree tests -L 1
cat .github/workflows/ci.yml
uv run pytest -q
```

What to say: one runner, 384 tests, three kinds. Point at `test_matching`,
`test_preferences`, `test_web_sessions` (unit: deterministic code),
`test_web_scan` (the API through a fake pipeline, no model), `e2e/`
(five Playwright flows against a local server). CI is lint plus that suite
on every push. `test_review_fixes.py` is the "every bug found gets a
test" file.

## 2. The eval set (screenshot: `photos list` and one label file)

```
uv run shelfscanner photos list | tail -8
cat data/labels/PXL_20250519_214502479.json | head -12
ls data/labels | wc -l
```

What to say: 65 labelled photos: five hand-labelled shelves, twenty
degraded copies (blur, glare, rotation, small), thirty-nine sourced from
Wikimedia Commons with licences recorded, and one real scan promoted from
the app. Labels are a JSON file per photo and a column in the table.

## 3. The extraction eval and the gate (screenshot: the PASS line)

```
uv run python -m research.eval --set core
```

What to say: the reading model over the five core shelves, the choosing
model over each, then the check against the committed baseline: recall,
invented titles, overlap with my own picks, latency, cost, each with a
tolerance. PASS or FAIL is the last line and the exit code. This is what
runs nightly.

## 4. A regression on screen (screenshot: the FAIL line)

```
uv run python -m research.matrix vision sonnet --set core --max-dim 640
uv run python -m research.check
```

What to say: same model, the image sent at 640 px instead of 1568. Recall
drops, the check names the metric and fails. Then run
`uv run python -m research.matrix vision sonnet --set core` to put the
latest rows back at 1568 and show it pass again.

## 5. Change the prompt, compare with a number (screenshot: the table)

```
diff prompts/recommend_v2.md prompts/recommend_v3.md
uv run python -m research.report --by-prompt --photos 1,2,3,4
```

What to say: v2 with my Goodreads export made the small model recommend
books that were not on the shelf on three of five photos; the validity
check caught every one (on-list 0.48). v3 moved the shelf list after the
preferences and restated the rule: on-list 1.00, mean overlap with my own
picks 3.25 against 2.50 for v1. The prompt is a file, the run is a row, the
comparison is a table. That is the whole argument for versioned prompts.

## 6. A real failure joins the set (screenshot: the `ok` line)

```
uv run shelfscanner photos label <scan id> --titles "..." "..." --partial "..."
uv run python -m research.matrix vision sonnet --set real
```

What to say: a scan someone did on their phone, promoted into the labelled
set with one command; from then on every eval reads it. The weekly review
is what tells me which scans to promote.

## 7. CI green on a pull request (screenshot: the PR checks)

```
gh workflow run weekly-review.yml
gh pr list
```

What to say: the weekly review agent drafts a review of the week's rows and
opens a pull request; CI runs on it like any other. Open the PR and show
the green check.

## Screenshots, in order

1. `tests/` tree next to `ci.yml`.
2. `pytest -q` ending in `384 passed`.
3. `photos list` tail with the `real` set visible, and a label file.
4. `research.eval` ending in `PASS`.
5. `research.check` ending in `FAIL` with the recall line.
6. The `--by-prompt` table with v2 export at 0.48 and v3 at 1.00.
7. The `photos label` `ok` line and the `real` set's extraction line.
8. The pull request page with the green check.
