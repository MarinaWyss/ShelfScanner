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

## Decided during the work

Tasks 1 to 4 (the web worker, 2026-09-03). Recorded here; flagged in
`results.md` at the close.

**W1. Unsave stamps, it does not delete.** `saved` gains `removed_at`; an
unsave sets it on the live row and a later save inserts a new row. That
keeps D1's history (a saved-then-unsaved pick is visible in the rows) and
keeps the "is it saved" question a single null check. Not-for-me rows are
only ever added; a pick marked twice counts once in the metric.

**W2. The first visit is the preferences page.** `GET /` redirects there
until the session has a preferences row. "Skip for now" writes an empty
object, so the page is seen once and the scan page is one tap away; D2
still holds because a scan with an empty object runs.

**W3. The taste-unknown note travels in `free_text`, only at scan time.**
`recommend.py` and `preferences.py` are not this worker's to change, and
`as_text` of an empty object is pinned by 004's tests. Putting the note in
the object the scan sends means the model reads it as "About the reader:
..." and the logged `preferences` column is exactly what the model saw.
The session's stored row stays empty.

**W4. The web uses `recommend_v2`.** The page builds structured objects
(genres, free text, rated books, to-read, avoid), which v2 explains to the
model and v1 does not. `web/pipeline.py:CHOOSING_PROMPT` is the one
place to change when 004's eval sets a default.

**W5. The page has no avoid field.** Genres, a free-text line and the
export are what R4 asks for; the avoid list comes from the export's
did-not-finish books, and the free-text line can say "no X". A re-import
rebuilds `rated_books`, `to_read` and `avoid` from the new file and does
not carry the previous avoid entries over, so nothing doubles up.

**W6. The export is parsed from the request body.** `preferences.py`
gains `rows_from_export(lines)` in a marked 005 block, and `read_export`
becomes the file-opening wrapper around it, so the upload is never
written to disk (R4).

**W7. The metric lives in `web/metrics.py`, not `research/report.py`.**
`save_rate(session_id=None)` returns saves per scan and not-for-me per
pick; `report` (the lead's file) prints its `line()`.
