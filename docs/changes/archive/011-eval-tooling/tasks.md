# 011 — Tasks

Work in order; small enough for the lead alone.

## 1. Prompt comparison

- `research.report --by-prompt`: grouping by `prompt_version` for the
  configured choosing model, overlap from `data/prefs/marina_picks.json`
  as `research.check` computes it. Test on seeded rows; run live on core.

## 2. One eval command

- `research/eval.py`: matrix on the set for the reading and choosing
  primaries (aliases overridable), then `check`; verdict last, non-zero
  exit on regression. `nightly-eval.yml` calls it. Test on a stubbed
  matrix and check.

## 3. Promote a scan

- `photos label <scan id> --titles ... [--partial ...]`: object copied,
  labelled row inserted with `set = 'real'`, label file written; the
  session row untouched. Migration: `photos.set` check gains `real`.
  Tests with a fake storage and database; one live run on a real scan.

## 4. Demo and close

- `demo.md` in this folder: the commands in order for the S8 segment,
  what each shows, and the screenshots to take.
- Specs: `run-logging.md` (report and eval commands), `photo-storage.md`
  (the `real` set and the command). Results, archive.
