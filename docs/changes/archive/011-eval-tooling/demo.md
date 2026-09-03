# The S8 demo: what to run, what it shows, what to say

This is the on-camera sequence for the "Testing an AI system" segment. Every
command was run on 2026-09-03 and produced the output described here; the
latency and cost figures will drift a little between runs, the shapes and
the pass or fail results will not. The whole sequence calls the models for
about twenty cents. Use a terminal at least 100 columns wide, because two of
the tables are wide.

## 1. The software tests

Run:

```
tree tests -L 1
cat .github/workflows/ci.yml
uv run pytest -q
```

What is on screen: the test folder, the CI workflow, and the suite finishing
with `384 passed`.

What to say: there is one test runner, pytest, and it runs on every push.
The tests come in three kinds. Unit tests cover the code that has a right
answer: matching a title the model read against a label, importing a
Goodreads CSV, issuing and hashing session tokens, the rate limit with a
fixed clock, the catalogue lookup against a stubbed service, and each
provider adapter against a stub of its SDK. Integration tests call the API
routes with a fake pipeline underneath, so the whole scan runs without a
model. Five Playwright tests drive a real browser against a local server:
photo to picks with progress, a check that no photo metadata leaves the
browser, a failure naming its stage, saving and marking picks, the admin
page. CI is lint and this suite; there is no separate type-check step. The
file `tests/test_review_fixes.py` holds one test per bug the code review
found this week, so each stays fixed.

## 2. The evaluation set

Run:

```
uv run shelfscanner photos list | tail -8
cat data/labels/PXL_20250519_214502479.json | head -12
ls data/labels | wc -l
```

What is on screen: the last rows of the photos table, one label file, and
the count of label files.

What to say: the evaluation set is 65 labelled photos. Five are my own
shelves, labelled by hand. Twenty are degraded copies of those five: blurred,
with glare, rotated, or shrunk, to stand in for bad phone conditions.
Thirty-nine are shelf photos from Wikimedia Commons with their licences
recorded, labelled by a model and then checked. One is a real scan someone
did through the app, promoted into the set. A label is a JSON file with the
titles that are readable in the photo, and the same list sits in a column
of the photos table, so the evaluation can be run from the database alone.

## 3. The evaluation and the gate

Run:

```
uv run python -m research.eval --set core
```

What is on screen: the reading model running over the five core shelves,
one line per photo with found, missed and invented counts; the choosing
model running over each; then the check against the committed baseline,
ending in `PASS`.

What to say: this one command is the evaluation. It reads every core photo
with the configured vision model and scores the result against the labels:
how many titles it found, how many it missed, how many it invented. Then it
asks the configured language model for five picks per shelf and scores
those: are all five on the list, and how many match the five I would have
picked myself. Then it compares recall, invented titles, overlap, latency
and cost to a baseline committed in the repo, with a tolerance on latency
and cost and none on the quality numbers. The last line is PASS or FAIL and
so is the exit code. The same command runs every night in GitHub Actions.

## 4. A regression, caught

The check measures the reading model and image size that config names, so
to show it catching something, change the config. That is also the honest
demonstration: a config change is the kind of mistake the gate exists for.

Run:

```
sed -i '' -e 's/^default_max_edge = 1568/default_max_edge = 640/' -e '/\[stages.reading\]/,/fallback/ s/primary = "gemini-flash"/primary = "sonnet"/' config/models.toml
uv run python -m research.eval --set core
git checkout config/models.toml
uv run python -m research.check
```

What is on screen: the eval runs again on the changed config and ends with
`REGRESSION`, followed by two lines: median recall 0.58 against a baseline
of 1.00, and 1.4 invented titles per photo against 0. After the revert, the
check passes again.

What to say: two lines of config changed: the photo is now sent to the
model at 640 pixels on its long side instead of 1568, and the reading model
is Sonnet. The evaluation runs the five shelves again, which costs about
three cents, and the check fails, naming the two numbers that got worse:
the model now finds barely half the titles, and it starts inventing ones
that are not there. Put the config back and the check passes again, because
the rows from the earlier run at 1568 pixels are still the latest ones at
that size. This was rehearsed with exactly those numbers.

## 5. Changing the prompt and comparing the versions

Run:

```
diff prompts/recommend_v2.md prompts/recommend_v3.md
uv run python -m research.report --by-prompt --photos 1,2,3,4
```

What is on screen: the diff between the two prompt files, then a table
with one row per prompt version. The row for v2 with the Goodreads export
shows an on-list share of 0.48 and an overlap of 0, 0, 3 and 1 on the four
shelves. The row for v3 with the export shows 1.00 and 4, 3, 2, 4, with a
mean of 3.25.

What to say: prompts are files in the repo, named by version, and every
model call records which version it used. So when I change a prompt I can
run the evaluation again and put the two versions next to each other, with
numbers. This is the case where that mattered. When I added my Goodreads
history to the prompt, the small choosing model started recommending books
that were not on the shelf at all, on three of five shelves. The format
check caught every one of those before a user could see them, but a caught
failure is still a failed scan. Version three of the prompt puts the
shelf list after the preferences and restates the rule that picks must come
from the shelf. With that change, every pick is on the shelf again, and the
picks agree with my own choices more often than any earlier version:
a mean of 3.25 out of 5 against 2.50 for the original prompt. I know that
because the comparison is a table I can produce on demand, not a feeling.

## 6. A real failure joins the set

Run, with the id of a scan made through the app and the titles that are
readable in that photo:

```
uv run shelfscanner photos label <scan id> --titles "First title" "Second title" --partial "A partly legible one"
uv run python -m research.matrix vision sonnet --set real
```

What is on screen: a line saying the scan became a labelled photo in the
`real` set, then the reading model's result for it: found, missed and
invented counts.

What to say: when a real scan goes wrong, the fix is to make it part of the
evaluation. This command copies the photo out of the session storage into
the labelled set with the titles I give it, and from then on every
evaluation reads that photo too. The weekly review, which reads the error
rows and the "not for me" marks, is what tells me which scans to promote.
That is how the set grows from real use rather than from photos I chose.

## 7. CI green on a pull request

Run:

```
gh workflow run weekly-review.yml
```

Then open the pull request it creates on GitHub.

What is on screen: the pull request titled "Weekly review <date>", with
the CI check green.

What to say: the weekly review is a scheduled job. It drafts a review of
the week's rows, an agent fills in what the failures mean and whether any
pattern deserves a change, and it opens a pull request. CI runs on that
pull request like on any other, so the review itself goes through the
same gate as the code.

## The screenshots, in order

1. The tests folder next to the CI workflow file.
2. The pytest run ending in `384 passed`.
3. The tail of the photos list with the `real` set visible, and a label file.
4. The eval ending in `PASS`.
5. The eval ending in `REGRESSION` with the two numbered lines, and the
   `PASS` after the revert.
6. The prompt comparison table, with the 0.48 and the 1.00 visible.
7. The `ok` line from `photos label` and the extraction line under it.
8. The pull request page with the green check.

## Two things to know before recording

Gemini is failing over to Sonnet until Google's verification clears, so the
reading lines on camera will name Sonnet; that is true and fine to say.
Step 4 is the only step that changes a file, and its `git checkout` line
puts the file back.
