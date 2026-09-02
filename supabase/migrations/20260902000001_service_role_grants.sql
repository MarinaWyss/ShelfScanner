-- This project does not auto-expose new public tables to the Data API roles:
-- after the first migration, anon / authenticated / service_role held only
-- REFERENCES, TRIGGER and TRUNCATE on the new tables, so the spike script
-- (service key, D12) got "permission denied for table photos".
--
-- Only the service role gets data access. The public roles are stripped of
-- what they had: with RLS and no policies they could not read rows anyway,
-- but TRUNCATE bypasses RLS and these tables reference private photos.

grant select, insert, update, delete
  on public.photos, public.extractions, public.recommendations
  to service_role;

grant usage, select on all sequences in schema public to service_role;

revoke all on public.photos, public.extractions, public.recommendations
  from anon, authenticated;
