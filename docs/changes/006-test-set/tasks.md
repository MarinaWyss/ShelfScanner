# 006 — Tasks

Work in order. ∥ marks tasks that can run in parallel worktrees.

## 1. Source photos ∥

- Search Wikimedia Commons and Openverse with a licence filter for shelf
  photos in the conditions the proposal lists; keep only CC0, CC BY and
  public domain; reject anything with a readable face. Save URL, author,
  licence and search terms in the label file; `photos fetch` downloads
  from the label files.
- Degraded copies of the five confirmed photos with the image module:
  blur, a glare gradient, 5 to 10 degree rotation, 1024 px. Labels copied
  from the originals with `derived_from`.

## 2. Labels ∥

- Label each sourced photo from the file at full resolution: `titles`,
  `partial`, `notes`, `provisional: true`. Batch of five per agent.
- `photos sync` and the `photos` row carry the flag, the set name and the
  licence.

## 3. Nightly eval ∥

- Workflow on a schedule: the primaries over every labelled photo, then
  `research.check` on the core set (the one with a baseline entry; a
  check on `sourced` or `derived` needs its own entry in
  `research/baseline.json` first), cap from `.env`, numbers in the job
  summary, failure on regression.

## 4. Run the sets

- Primary and fallback reading model over every sourced and degraded photo; primary
  choosing model over each best extraction with Marina's preferences.
- Baseline updated per set (D3).

## 5. The lookup decision

- Invented count over all primary-model extractions, test set and real
  scans. Apply D2, write the rule's outcome and the counts to
  `results.md`, and set 007's scope accordingly.

## 6. Specs, results, archive

- `docs/specs/evaluation.md` (sets, provisional labels, nightly run,
  check); `photo-storage.md` updated.
