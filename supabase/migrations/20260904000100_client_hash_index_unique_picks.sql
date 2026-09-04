-- Change 017, from the review of the first cut.
--
-- The per-address limit counts `photos` rows by `client_hash` over the last hour on
-- every upload; without an index that is a sequential scan of a table that keeps
-- every row for ever (retention nulls the hash and keeps the row). Partial, since
-- test-set photos and retained rows have a null hash and are never asked for.
create index photos_client_hash_created_at_idx
  on public.photos (client_hash, created_at)
  where client_hash is not null;

-- Save and "not for me" are idempotent (017): one live save per pick, one mark of a
-- kind per pick. A select-then-insert in the app is two round trips and lets two
-- simultaneous clicks both insert; the index makes the second insert fail (23505),
-- which the app treats as "already there". `saved` keeps its history: a removed row
-- is outside the partial index, so a save after an unsave is a new row as before.
create unique index saved_live_pick_idx
  on public.saved (session_id, recommendation_id, pick_index)
  where removed_at is null;

create unique index feedback_one_mark_idx
  on public.feedback (session_id, recommendation_id, pick_index, kind);
