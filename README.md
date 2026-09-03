# ShelfScanner

Point a phone at a bookshelf and get five books from that shelf you would
actually like, each with a reason. See `docs/scoping.md` for the problem and
constraints, `docs/specs/` for what the code does today, and
`docs/changes/` for proposals and their results.

`docs/mvp-diagram.html` is a one-figure diagram of the pipeline as built;
`docs/architecture.html` is the five-box architecture with the status of
each box.

Current state (2026-09-03): the whole scan runs, on the command line and
as a phone-first web app served locally: upload with metadata stripped,
spines read by a vision model, titles verified against Open Library,
five picks with reasons, save and "not for me", a device session with no
account. Model calls go through a router of our own with per-stage
failover, a spend guard, a dashboard and a weekly review, deployed to Vercel
from this repository (010; `docs/specs/deployment.md`), with the earlier
ShelfScanner's pages, words and flow (012, 014). The MVP that started it, and the
numbers behind the model choice, are in
`docs/changes/archive/001-mvp/results.md`; the roadmap and its status are
in `docs/changes/README.md`.

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

## Deploy

The app runs on Vercel from this repository: `index.py` is the entry point
its FastAPI preset finds, `vercel.json` trims the bundle, and the
environment variables in `.env.example` (minus the fake-pipeline, retention
and CLI-cap ones) are set in the Vercel project for Production and Preview.
`main` is production and protected: work happens on a branch, lands by pull
request once CI is green, and every branch and pull request gets a preview URL.
`docs/specs/deployment.md` has the rest.

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
