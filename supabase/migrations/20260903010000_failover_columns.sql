-- Change 002 D8: when the stage's primary fails for a provider reason and the fallback answers,
-- the row records the model that answered in `model` and the one that failed here.

alter table public.extractions
  add column failover_from text,
  add column failover_error text;

alter table public.recommendations
  add column failover_from text,
  add column failover_error text;
