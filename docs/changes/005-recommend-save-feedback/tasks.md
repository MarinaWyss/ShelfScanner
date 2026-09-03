# 005 — Tasks

Work in order. ∥ marks tasks that can run in parallel worktrees.

## 1. Schema

- Migration: `saved`, `feedback` (session_id, recommendation_id, pick
  index, created_at; feedback has a `kind`). Grants.

## 2. Preferences page ∥

- Genre picks and Goodreads upload, writing through 004's importer to the
  session's preferences row. Shown on first visit, reachable after.

## 3. Recommendation in the scan ∥

- `POST /scan` continues into recommendation; a "choosing" event; the
  result page renders five picks with reasons, or the error naming the
  stage.

## 4. Save and feedback ∥

- Buttons on each pick, htmx posts, rows written. `GET /saved` lists the
  session's saves with the shelf date.

## 5. Report and e2e

- `report`: save rate per scan, not-for-me rate per pick.
- Playwright: full flow with a fake router; save, unsave, mark.
- Three real scans on the phone, timings recorded.

## 6. Specs, results, archive

- `docs/specs/web.md`, `feedback.md`, `recommendation.md` updated.
