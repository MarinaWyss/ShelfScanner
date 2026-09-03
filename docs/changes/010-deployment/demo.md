# The S9 demo: what to do, what it shows, what to say

This is the sequence for the "Deployment on Vercel" segment, in the order
it happens. Steps 1 to 8 are things to do in the dashboard, the terminal
and on the phone; the last two sections are the script lines that change
and the screenshots to take. The repo side of 010 is already on `main`, so
the first deployment works as is.

## 1. Pull main

Run:

```
git checkout main && git pull
uv run python -c "import index; print(index.app.title)"
```

What is on screen: `ShelfScanner`.

What it is: the entry point Vercel looks for is `index.py` at the root of
the repo. It re-exports the same FastAPI app that uvicorn serves on the
laptop. That is the whole Vercel-specific code: one file.

## 2. Connect the repo

In the browser, at vercel.com: **Add New → Project → Import Git
Repository**, pick `MarinaWyss/ShelfScanner`. Leave the framework preset
on what it detects (FastAPI), the root directory at the repo root, and the
build settings untouched.

Before pressing Deploy, open **Environment Variables** on the same screen
and add these, with the values from your `.env`. Tick both Production and
Preview for every one.

```
SUPABASE_URL
SUPABASE_SECRET_KEY
GEMINI_API_KEY
OPENAI_API_KEY
ANTHROPIC_API_KEY
OPENROUTER_API_KEY
SHELFSCANNER_ADMIN_SECRET
SHELFSCANNER_SCANS_PER_HOUR
SHELFSCANNER_APP_DAILY_CAP_USD
```

Do not add `SHELFSCANNER_FAKE_PIPELINE`, `SHELFSCANNER_SPEND_CAP_USD` or
`SHELFSCANNER_RETENTION_DAYS`: the first would make the deployed app fake,
the other two belong to the CLI and the retention job, which do not run
here. `OPENROUTER_API_KEY` is only used by the one OpenRouter model in
`config/models.toml`, which no stage names; set it anyway so a config
change later does not fail on a missing key.

Press **Deploy**. The first deployment builds from `main` and is
production. It takes a minute or two.

What is on screen: the build log, then the deployment page with a
`.vercel.app` URL and the confetti.

What to say: the app was laid out for this from the first app change,
so connecting is a click and a set of environment variables. The secrets
were in a `.env` file on the laptop; now they are in a dashboard, and the
repo has never had one in it.

## 3. Check production from the laptop

Open the URL. The preferences page comes first on a fresh device, then the
scan page. Then open `<url>/admin`, enter the admin secret, and see the
dashboard reading the same Supabase tables the laptop reads.

Record the cold start. Wait ten minutes without touching the URL, then:

```
curl -s -o /dev/null -w 'first: %{time_total}s\n' https://<url>/preferences
curl -s -o /dev/null -w 'warm:  %{time_total}s\n' https://<url>/preferences
```

Put the two numbers in `results.md` under "Cold start".

What to say: nothing in the app changed. The database and the bucket were
already remote, so the deployed app and the laptop are two clients of the
same tables; the admin page proves it.

## 4. Let the phone open previews

Vercel protects preview deployments behind a Vercel login by default. On
the phone that would mean logging in to Vercel before the scan page
appears. Either log in on the phone once, or in the project's **Settings →
Deployment Protection**, turn **Vercel Authentication** off for this
project. Production is never protected.

## 5. A pull request gets a preview URL

Make a branch with a real change: the results so far.

```
git checkout -b 010-results
# put the cold-start numbers and the production URL into docs/changes/010-deployment/results.md
git commit -am "010: production URL and cold start"
git push -u origin 010-results
gh pr create --title "010: production URL and cold start" --body "First numbers from the deployed app."
```

What is on screen: within a minute the pull request has a comment from the
Vercel bot with a **Preview** link and a green checkmark, next to the CI
check from GitHub Actions.

Open the preview link on the phone, on mobile data, and scan a shelf. The
stages appear one at a time: reading the shelf, checking titles, choosing.
Note the time from tap to picks.

What to say: every branch and every pull request gets its own URL with the
same environment variables, so a change can be tried on a phone before it
is merged. The CI check runs beside it. Tests gate the merge of a pull
request; the deploy is Vercel's job.

## 6. Merge, and production follows

Merge the pull request on GitHub. In the Vercel project's **Deployments**
tab a new deployment marked **Production** starts from the merge commit.
Note how long it takes to be marked Ready.

What to say: main is production. A merge is the deploy; there is no step
after it. That is the whole pipeline: push, tests, preview, merge, live.

## 7. Three scans on mobile data

On the production URL, on mobile data, scan three shelves. A bookstore is
the good version of this; any three shelves at home are the acceptable one.
Time each from tap to picks with the phone's stopwatch, and afterwards read
the per-stage p50 latency from `<url>/admin`. Put the three times in
`results.md` (the pass line is five picks under 15 s p50).

## 8. Point at the rate limit and the spend cap

Show the two lines in `.env.example` and the same names in the Vercel
environment variables page (values hidden). Then show the check itself,
`src/shelfscanner/web/limits.py`: two checks, both under a screen of code.

To show the rate limit firing without spending anything, run the app on
the laptop with the fake pipeline and a limit of one:

```
SHELFSCANNER_FAKE_PIPELINE=1 SHELFSCANNER_SCANS_PER_HOUR=1 uv run uvicorn shelfscanner.web.app:app --port 8000
```

Open `http://localhost:8000`, skip the preferences, scan any photo, then
scan again.

What is on screen: the second scan is refused with "This device has
scanned 1 shelf in the last hour, and the limit is 1 per hour. Try again
in a while."

What to say: the limit is per device, ten scans an hour, and it does not
need a new table: the photos table already records which device scanned
when, so the check is a count over the last hour. Under that is the app's
own daily cap, five dollars across every device, summed from the rows that
log every model call; when it is reached the page says how much was spent
and that scans start again tomorrow. Both fail loud, with the number,
because a silent slowdown would corrupt the save-rate metric. The layer
under both is a budget in each provider's console, set by hand, which is
the backstop for a bug in mine.

## The script lines that change

The setup, the "keep it plain" line and the handoff stand as written.
These are the tension and payoff lines that should say what the product
does:

- "The vision call takes ten-plus seconds, which runs into serverless
  function limits, so the request shape has to account for that." → The
  reading call takes several seconds and the whole scan ten to fifteen. A
  function on Vercel can run for five minutes, so the limit is not the
  problem; the shape still matters. The upload is one request that stores
  the photo and returns. The model calls run inside the event stream the
  phone is already listening to for progress, so the work happens while
  a response is open, and a status column on the photo row is the lock, so
  a dropped connection that reconnects never runs a model twice.
- "Rate limiting per session so a stranger can't drain the API budget (a
  small table in Postgres is enough)." → Ten scans per device per hour,
  counted from the photos table that already exists, and a five-dollar
  daily cap for the whole app, summed from the runs tables. Both refuse
  with a message that states the number.
- "A hard daily spend cap on the model provider side." → The daily cap is
  in the app, from the rows; the provider's console budget is the backstop
  under it.
- "Preview deployment on every PR, production on merge to main." → True
  as written. One honest caveat if you want it: Vercel deploys on push and
  does not wait for CI, so a direct push to main is live before its tests
  finish; pull requests are the gated path.
- Optional, one sentence: the retention job that deletes photos after
  thirty days stays on GitHub Actions rather than moving to a Vercel cron,
  because it already exists and needs no route to protect.

## The screenshots, in order

1. The Vercel import screen with the repo selected and FastAPI detected.
2. The environment variables list, values hidden, Production and Preview
   ticked.
3. The first deployment marked Ready with the production URL.
4. The admin dashboard at the production URL.
5. The pull request with the Vercel bot's preview comment and the green
   CI check side by side.
6. The phone on the preview URL, stages visible mid-scan.
7. The Deployments tab with the Production deployment from the merge.
8. The phone on the production URL with five picks, in the bookstore if
   that is where you are.
9. The 429 message on the laptop with the limit set to one.
10. `web/limits.py` with the two checks on screen.
11. A provider console's budget page.

## Two things to know before recording

Gemini still fails over to Sonnet until Google's verification clears, so
the reading stage on the deployed app runs on Sonnet too; the picks are
the same code path. And the first request after ten idle minutes is the
slow one; the number is in `results.md`, and it is fair to say so.
