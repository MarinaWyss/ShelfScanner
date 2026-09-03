# ShelfScanner

Point a phone at a bookshelf and get five books from that shelf you would
actually like, each with a reason. See `docs/scoping.md` for the problem and
constraints, `docs/specs/` for what the code does today, and
`docs/changes/` for proposals and their results.

`docs/mvp-diagram.html` is a one-figure diagram of the pipeline as built;
`docs/architecture.html` is the five-box target for v1 with what exists
and what is planned.

Current state: a command-line spike that answers two questions, whether an
affordable vision model can read spines and whether an affordable language
model can recommend specifically from the result. Both are yes; the numbers
and the model choice are in `docs/changes/archive/001-mvp/results.md`.

## Setup

Requires Python 3.12+, [uv](https://docs.astral.sh/uv/), the Supabase CLI,
a Supabase project and an OpenRouter key.

```
uv sync
cp .env.example .env        # fill in SUPABASE_URL, SUPABASE_SECRET_KEY, OPENROUTER_API_KEY
supabase link               # pick the project
supabase db push --linked   # tables and the private photo bucket
```

Put shelf photos in `data/photos/` (gitignored) with a matching label file
in `data/labels/` for each; see `docs/specs/photo-storage.md` for the
format.

## Commands

```
uv run shelfscanner photos sync                      # strip metadata, upload, upsert labels
uv run shelfscanner extract --photo all --model gemini-flash
uv run shelfscanner recommend --extraction 16 --model gpt-mini --prefs data/prefs/marina.json
uv run shelfscanner run --photo 3 --vision-model sonnet --llm-model qwen-flash --prefs data/prefs/marina.json
uv run shelfscanner score --recommendation 17 --specificity 3 2 3 2 2
uv run pytest
```

Model aliases and slugs are in `config/models.toml`; prompts are in
`prompts/`, versioned by filename.

Research tooling lives outside the pipeline package, in `research/`:

```
uv run python -m research.matrix vision sonnet,gemini-flash          # every model over every photo
uv run python -m research.matrix llm gpt-mini,qwen-flash              # every model over the best extraction per photo
uv run python -m research.report [--html docs/changes/archive/001-mvp/report.html]
```

## Layout

```
config/models.toml       candidate models, match threshold, image size
prompts/                 one file per prompt version
data/labels/             hand labels per photo (committed)
data/photos/             photos (gitignored)
data/prefs/              preferences files
src/shelfscanner/        the pipeline: cli, settings, db, config, images,
                         storage, openrouter, matching, extract, recommend
research/                comparison tooling: matrix drivers, text and
                         visual reports
supabase/migrations/     schema, grants, constraints
tests/                   pure pieces: metadata stripping, matching,
                         validity checks, aggregation
docs/                    scoping, specs, changes
```
