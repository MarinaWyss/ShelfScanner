# 004 — Tasks

Work in order. ∥ marks tasks that can run in parallel worktrees.

## 1. Importer ∥

- `preferences.py`: parse a Goodreads export into the preferences object
  (D1, D2). Fixture CSV in `tests/fixtures/`, anonymised.
- `prefs import --csv <file> [--genres ...] [--session id]` writes the
  object to `data/prefs/<name>.json` or to the preferences table.

Done when: tests pass on the fixture and on Marina's export (locally,
gitignored).

## 2. Schema ∥

- Migration: `preferences` (session_id, object as jsonb, updated_at).
- `recommend` and `run` accept `--prefs <file|session id>`.

Done when: a run with a session id logs the same `preferences` column as a
run with the file.

## 3. Prompt v2

- `prompts/recommend_v2.md`: explains ratings, to-read and avoid, keeps the
  hard rules from v1 (exact titles, five picks, one reason each).
- `research.matrix llm` gains `--prompt`.

Done when: a v2 run on photo 2 returns five valid picks.

## 4. Eval

- v1 and v2, flat file and export, primary and fallback choosing model,
  over the five best extractions. Overlap and cost per cell.
- Set the default prompt and preferences shape in config from the result.
- `research/baseline.json` updated if the default changed, with the
  change noted.

Done when: the table is in `results.md` and `research.check` passes.
Done 2026-09-03: the grid is in results.md; the default is `recommend_v3`
(new, from the eval); the baseline did not need to change.

## 5. Specs, results, archive

- `docs/specs/preferences.md`; `recommendation.md` updated.
