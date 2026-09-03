# Deployment

How the app reaches a phone that is not on the laptop's network (change
010). The app itself is described in `web.md`; this file describes where it
runs and what is different there.

## Where it runs

The app is a Vercel project connected to the GitHub repository. Vercel's
FastAPI preset finds the `app` instance re-exported by `index.py` at the
repository root and runs the whole app as one function on Vercel's Python
runtime (3.12, from `.python-version`), routing every request to it. The
entry file puts `src/` at the front of the import path so the package is
imported from the checkout and `settings.REPO_ROOT` resolves to the
repository, where `config/models.toml` and `prompts/` are read from.

`vercel.json` keeps `tests/`, `docs/`, `research/`, `data/`, `supabase/` and
the agent folders out of the function bundle; nothing in them is read at
request time. Dependencies come from `pyproject.toml` and `uv.lock`.

- Production is `main`: every push to `main` deploys.
- Every other branch, and every pull request, gets a preview deployment at
  its own URL.
- GitHub Actions runs lint and the tests on every push (CI); a pull request
  shows the check, and the review PRs are merged only when it is green.
  Vercel does not wait for CI: a direct push to `main` is live before its
  tests finish, so a change that must be gated goes through a pull request.

## What is different from the laptop

- **Secrets** live in the project's environment variables in the Vercel
  dashboard, for both the Production and the Preview environment. There is
  no `.env`; `load_dotenv` finds nothing and the process environment is
  used. The variables are the ones in `.env.example` minus
  `SHELFSCANNER_FAKE_PIPELINE`, `SHELFSCANNER_RETENTION_DAYS` and
  `SHELFSCANNER_SPEND_CAP_USD` (the CLI's cap; the app has its own).
- **The scan is shaped for a function.** `POST /scan` stores the photo and
  returns; the model calls run inside `GET /scan/{id}/events`, so the work
  happens while a response is streaming, and a function on Vercel may
  stream for up to 300 s (the Hobby maximum, also the default; nothing is
  configured). A stage that dies with its connection is released by the
  claim rule after `STALE_CLAIM_S` (`web.md`, Events).
- **The session cookie carries `Secure`** when the request came over https,
  which the middleware reads from the request's scheme or from
  `x-forwarded-proto` (Vercel terminates TLS and forwards plain http). On
  the local network, over plain http, the flag is omitted, or the phone
  would drop the cookie.
- **The upload limit** is Vercel's 4.5 MB request body; the app's own
  `MAX_BODY_BYTES` is 4 MiB and the phone resizes before upload, so the
  platform limit is never the one that fires.
- **Static files** (`/static/`) are served by the function, not the CDN:
  the session middleware is top-level, and Vercel keeps mounts behind
  top-level middleware in the function.
- **Retention** stays a GitHub Actions job (`.github/workflows/retention.yml`,
  daily 04:17 UTC), not a Vercel cron. 010 decided this: the job exists,
  is tested and needs no route or secret of its own; a Vercel cron on the
  Hobby plan would add a protected endpoint for the same daily run.
- **Cold start.** The first request after idle imports the provider SDKs
  and connects to Supabase; the cold-start time is recorded in
  `docs/changes/010-deployment/results.md`.

## Limits that stand between a stranger and the bill

Both are the app's (`web.md`, Limits), not the platform's: ten scans per
device per rolling hour (429), and five dollars of app spend per UTC day
across every device (503), read from the runs tables. A hard budget in each
provider's console is the layer under that, and is set by hand outside the
repo.

## Tests

`tests/test_web_sessions.py` covers the `Secure` flag over https and over
forwarded https, and its absence over http. `index.py` is imported by the
Vercel build, not by a test; `uv run python -c "import index"` is the local
check.
