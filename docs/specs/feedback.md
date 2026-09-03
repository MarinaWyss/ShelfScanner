# Save and feedback

What a user can say about a pick: save it, or mark it not for me. Both are
rows tied to the recommendation row that produced the pick, so either can
be joined to the model, prompt version and preferences behind it (scoping
F1, F2; 005 D1). The saved list is per device and that is the whole
feature (005 D3).

## Addressing a pick

A pick is `(recommendation_id, pick_index)`: the `recommendations` row and
the position in its `parsed_recommendations`. The routes take both in the
path. The recommendation must belong to the device's session (its
extraction's photo has that `session_id`), have no error, and the index
must be within its picks; otherwise 404 and nothing is written.

## Routes

`POST /picks/{recommendation_id}/{pick_index}/save` inserts a `saved` row.
`POST .../unsave` stamps `removed_at` on every live `saved` row for that
pick (normally one). `POST .../not-for-me` inserts a `feedback` row with
`kind = 'not_for_me'`.

Each responds with the pick's state: `{"recommendation_id", "pick_index",
"saved", "not_for_me"}`, or for htmx requests the pick's controls as an
HTML fragment, which the page swaps in place. A pick is saved while it has
a `saved` row with `removed_at` null; it is not-for-me once any feedback
row of that kind exists. The two are independent: a pick can be both.

`GET /reading-list` (v1's address, 014; `/saved` redirects to it) lists the session's live saves, newest first: title, reason,
the date the shelf was scanned (the photo's `created_at`), and a Remove
control that posts an unsave and drops the item from the list. Empty until
something is saved. With `Accept: application/json` it returns
`{"saved": [{"recommendation_id", "pick_index", "title", "reason",
"saved_at", "scanned_at"}]}`.

## Tables

`saved`: `id`, `session_id` (references `sessions`, deleted with it),
`recommendation_id` (references `recommendations`, deleted with it),
`pick_index` (smallint, 0 or more), `created_at`, `removed_at` (null while
live). No unique constraint: the rows are a history, so a save, an unsave
and a save again are three states of two rows. Indexed on
`(session_id, recommendation_id)`.

`feedback`: `id`, `session_id`, `recommendation_id`, `pick_index`, `kind`
(text, checked against the list of kinds: `not_for_me`), `created_at`.
Rows are only added; marking a pick again adds another row. Indexed on
`(session_id, recommendation_id)`.

Both tables: RLS on, no policies, `service_role` only, like every other
table. Migration `20260903153000_saved_feedback.sql`.

## The metric

`web/metrics.py:save_rate(session_id=None)`: over one session's scans or
every session's (recommendation rows whose photo has a session; test-set
runs are not scans).

- A scan is a recommendation row without an error: one that put picks on a
  screen. Picks are the picks across those rows.
- Saves per scan: picks with a live `saved` row, divided by scans.
- Not-for-me per pick: picks with at least one `not_for_me` row, divided
  by picks. A pick marked twice counts once.

`SaveRate.line()` renders it, for example `save rate 1.00 per scan (2
saves / 2 scans); not for me 0.10 per pick (1 / 10 picks)`.
