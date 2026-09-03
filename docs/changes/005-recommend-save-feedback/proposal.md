# 005 — Recommendations in the app, saved list, feedback

Status: approved 2026-09-02
Date: 2026-09-02
Deadline: 2026-09-23
Spend cap: $10
Track: app (after 003 and 004)

## Why

003 shows titles; 004 makes recommendations good. This change joins them
and adds the two things the primary metric is made of: saving a pick, and
saying one was wrong. After this change the scoping doc's success metric
(a save per scan) is measurable from the rows.

## What changes

- Preferences on screen: genre picks and an optional Goodreads upload on
  first visit, editable later; stored per session through 004's table.
- The scan continues past extraction into recommendation through the
  router, with "choosing" as a progress stage. Five picks with reasons on
  the result page (R1 to R3).
- Save and "not for me" on each pick; a saved list page for the session
  (F1, F2).
- Tables `saved` and `feedback`, each referencing the recommendation row
  and the pick's position, so a save joins to the model, prompt version
  and preferences that produced it.
- `report` gains save rate per scan and not-for-me rate per pick.

### Out of scope

- Book covers, authors from a catalogue, purchase links (007 for
  enrichment; links never).
- Limits and retention (008).

## Decisions

**D1. Feedback is per pick and tied to the run.** A save is a row, not a
flag on the recommendation, so the same pick saved twice or unsaved is a
history, and the join to the run makes the metric attributable.

**D2. A scan with no preferences still runs.** Genres default to none;
the model gets the shelf and a note that taste is unknown. Better a
generic list than a form wall at a shelf.

**D3. The saved list is per device, and that is the whole feature.** No
export, no sharing. A list on the phone at the till is the use case.

## How we know it worked

| Question | Pass |
|---|---|
| End to end on a phone | Upload to five picks with reasons under 15 s p50 on three real scans |
| Feedback lands | Playwright: save two, unsave one, mark one; the rows and the list match |
| Metric is live | `report` prints save rate over the session's scans |
| Nothing regressed | `research.check` passes; CLI unchanged |
