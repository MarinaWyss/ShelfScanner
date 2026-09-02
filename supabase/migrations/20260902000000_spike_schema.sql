-- 001-mvp spike: photos, extractions, recommendations, and the private photo bucket.
-- See docs/changes/001-mvp/proposal.md ("What gets built", D12).
--
-- RLS is enabled on every table with no policies: the spike script uses the
-- service key, and nothing else should be able to read these rows.

-- ---------------------------------------------------------------------------
-- photos: one row per test-set photo with its hand-labelled ground truth (D2).
-- ---------------------------------------------------------------------------
create table public.photos (
  id              bigint generated always as identity primary key,
  storage_path    text not null unique,          -- object key inside the shelf-photos bucket
  titles          text[] not null default '{}',  -- ground truth: readable by a human at full resolution
  partial_titles  text[] not null default '{}',  -- fragments a human who knows the book can still name
  notes           text,                          -- angle, light, occlusion, what was left unlabelled
  created_at      timestamptz not null default now()
);

alter table public.photos enable row level security;

-- ---------------------------------------------------------------------------
-- extractions: one row per vision-model call over a photo (D1, D4, D7, D13).
-- ---------------------------------------------------------------------------
create table public.extractions (
  id               bigint generated always as identity primary key,
  photo_id         bigint not null references public.photos (id) on delete cascade,
  provider         text,                       -- upstream provider OpenRouter actually used
  model            text not null,              -- OpenRouter slug
  prompt_version   text not null,              -- prompt filename, e.g. extract_v1.md (D8)
  image_long_edge  integer not null,           -- requested long edge in px (D7)
  image_width      integer,                    -- actual resized dimensions sent (D7)
  image_height     integer,
  raw_output       text,                       -- model reply verbatim
  parsed_titles    jsonb,                      -- [{"title": ..., "author": ...}, ...] or null on parse error (D9)
  found            text[] not null default '{}',   -- label titles matched by an extracted title
  missed           text[] not null default '{}',   -- label titles no extracted title matched
  invented         text[] not null default '{}',   -- extracted titles matching no label
  partial_matched  text[] not null default '{}',   -- extracted titles matching a partial label; excluded from metrics
  found_count      integer not null default 0,
  missed_count     integer not null default 0,
  invented_count   integer not null default 0,
  latency_ms       integer,
  input_tokens     integer,
  output_tokens    integer,
  cost_usd         numeric,                    -- as reported by OpenRouter usage accounting (D13)
  error            text,                       -- set on HTTP or JSON parse failure; metrics stay at defaults
  created_at       timestamptz not null default now()
);

create index extractions_photo_id_idx on public.extractions (photo_id);
create index extractions_model_idx on public.extractions (model);

alter table public.extractions enable row level security;

-- ---------------------------------------------------------------------------
-- recommendations: one row per language-model call over an extraction (D1, D5, D6).
-- ---------------------------------------------------------------------------
create table public.recommendations (
  id                       bigint generated always as identity primary key,
  extraction_id            bigint not null references public.extractions (id) on delete cascade,
  provider                 text,
  model                    text not null,
  prompt_version           text not null,
  preferences              jsonb not null,     -- the preferences object exactly as sent
  raw_output               text,
  parsed_recommendations   jsonb,              -- [{"title": ..., "reason": ...}, ...] or null on parse error
  valid_vs_extraction      integer,            -- recommended titles matching the extraction's titles (D5)
  valid_vs_ground_truth    integer,            -- recommended titles also matching the photo's labels (D5)
  specificity_scores       smallint[],         -- one 1-3 score per recommendation, entered by hand (D6)
  latency_ms               integer,
  input_tokens             integer,
  output_tokens            integer,
  cost_usd                 numeric,
  error                    text,
  created_at               timestamptz not null default now()
);

create index recommendations_extraction_id_idx on public.recommendations (extraction_id);
create index recommendations_model_idx on public.recommendations (model);

alter table public.recommendations enable row level security;

-- ---------------------------------------------------------------------------
-- Private bucket for the shelf photos. Photos may show private rooms; nothing
-- grants read access to it, so only the service key can fetch objects.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('shelf-photos', 'shelf-photos', false, 20971520, array['image/jpeg', 'image/png'])
on conflict (id) do nothing;
