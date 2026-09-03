-- Change 011: a real scan promoted into the labelled test set (`shelfscanner photos label <scan id>`)
-- is a new photos row in set `real`: kept, labelled, no session, the object copied out of the
-- session prefix so retention on the original does not touch it.

alter table public.photos drop constraint photos_set_check;
alter table public.photos
  add constraint photos_set_check check ("set" in ('core', 'sourced', 'derived', 'real'));
