-- Change 002: rows record which adapter made the call, so a direct-SDK run and an
-- OpenRouter run of the same model are distinguishable in the report. `provider`
-- keeps meaning who served it; `adapter` is our own code path. Request ids too.

alter table public.extractions
  add column adapter text,
  add column request_id text;

alter table public.recommendations
  add column adapter text,
  add column request_id text;
