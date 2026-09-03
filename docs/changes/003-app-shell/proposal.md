# 003 — App shell: photo to titles on a phone

Status: approved 2026-09-02
Date: 2026-09-02
Deadline: 2026-09-16
Spend cap: $10
Track: app (parallel with 004)

## Why

The pipeline runs from a terminal. The user in the scoping doc is standing
at a shelf with a phone. This change puts the first two boxes of the
architecture behind a URL so a scan can happen from a phone, at home over
the local network for now. Building the UI before the recommendation is
ready is fine: titles on screen is a result someone can be shown, and
every later app phase builds on this shell.

## What changes

- A FastAPI service in `src/shelfscanner/web/` that imports the pipeline
  package, with the entry point laid out the way Vercel's Python runtime
  expects, so 010 is a connect-the-repo step. No second copy of any logic.
- Device session: a random token set as a cookie on first visit, stored in
  a `sessions` table. No account (F3).
- Upload: the page resizes the photo on the phone to a 1568 px long edge
  and re-encodes it before sending, which drops the metadata and keeps
  the body under Vercel's 4.5 MB function limit. The server strips and
  checks again with the existing image module, stores the object in the
  bucket under the session, and writes a `photos` row with no labels
  (U1, U2).
- Extraction runs through the router with progress sent over
  server-sent events; the page shows which stage is running (S1).
- One page, phone-first, server-rendered with htmx: choose a photo, watch
  the stages, see the titles read. Errors name the stage (E2).
- Local run with uvicorn bound to the local network so a phone can reach
  it; CI runs the Playwright suite against the same command.

### Out of scope

- Preferences and recommendations on screen (005).
- Rate limits, retention, cost cap in the app (008). The pipeline's spend
  guard from 002 still applies.
- Deployment (010). The laptop and the phone on the same network are
  enough for every test in this phase.

## Decisions

**D1. Server-rendered pages with htmx, not a JavaScript app.** The whole UI
is one form and one progress view. Server rendering keeps the pipeline the
only place with logic, and a Playwright test drives it the same way a
phone does.

**D2. The `photos` table serves both the test set and real scans.** A
`session_id` column, null for test-set photos, and labels empty for real
scans. `report` and `research.check` filter to labelled photos.

**D3. Progress is per stage, from the router's callback (002 D7).** Four
events: uploaded, reading, done, failed. No token streaming.

**D4. Shaped for Vercel, deployed later.** The target host is Vercel from
GitHub (010). Its Python runtime runs FastAPI with streaming responses
and a 300 s limit on the Hobby plan, so the scan and its progress events
fit. Its 4.5 MB request body limit does not fit a raw phone photo, hence
D5. No container: Vercel builds from the repo.

**D5. Resize on the phone.** A canvas re-encode to 1568 px before upload.
Change 001 showed that size loses nothing; it also makes U1 literally
true (no metadata leaves the device) and cuts upload time on a weak
signal. The server check stays as the second line.

## Decided during the work

Tasks 1 to 3, 2026-09-02.

**W1. The scan id is the `photos` row id, and the reading stage runs inside
the events request.** Nothing is held in process between requests: `POST
/scan` stores the photo and returns its id, `GET /scan/{id}/events` runs
extraction while streaming, `GET /scan/{id}` reads the latest extraction
row. One uvicorn process and a Vercel function behave the same way, and
a reconnect after `done` replays the result instead of reading again. A
second connection during the reading would run it twice; 008 can add a
lock if it matters.

**W2. Four stage events plus a `close` event.** The htmx SSE extension
closes its connection on one named event, and an `EventSource` reconnects
whenever the server ends the stream, so `done` and `failed` are each
followed by `close`. The four stages in D3 are unchanged.

**W3. The pipeline boundary is a four-method protocol** (`store`, `photo`,
`read`, `result` in `web/pipeline.py`). The real one wraps
`storage.store_session_photo`, `extract.extract_photo` and one query on
`extractions`; `web/fakes.py` holds the in-memory one and a fake
`ModelClient`, used by the tests and by `SHELFSCANNER_FAKE_PIPELINE=1`
for running the server without credentials. The Playwright suite starts
uvicorn in a thread with those fakes rather than a subprocess, so the
test can read the stored bytes directly.

**W4. Sessions are a plain ASGI middleware, not a dependency.** A FastAPI
dependency cannot set a cookie on a `StreamingResponse`, and Starlette's
`BaseHTTPMiddleware` buffers streams. The cookie has no `Secure` flag
until 010 puts the app behind https. `photos.session_id` is `on delete
cascade`: a session's photos may show a private room and go with it.

**W5. Vercel entry at `api/index.py`.** Vercel's FastAPI guide looks for an
`app` instance in `index`/`app`/`main`/... files at the root or under
`api/`, `src/` or `app/`; `pyproject.toml` is off limits to workers, so
the `tool.vercel.entrypoint` alternative was not used. The file only
re-exports `shelfscanner.web.app:app`, with a `src/` path fallback in case
the build installs dependencies but not the project. No `vercel.json`.
Static files are served by the app from `web/static/` rather than a
`public/` directory, so the local and hosted layouts are identical.

**W6. htmx is vendored, not loaded from a CDN**, so the Playwright suite
and a phone on a network without internet both work; 50 KB in the repo.

**W7. `extract_photo` is reused unchanged.** It downloads the photo it just
stored and logs the extraction with every title as `invented` (no labels).
The redundant download costs one bucket round trip per scan; the titles
come from the logged `parsed_titles`. Changing the pipeline's signature
to take bytes was left for when latency numbers (task 4) say it matters.

## How we know it worked

| Question | Pass |
|---|---|
| Works on a phone | Marina uploads a shelf photo from her phone to the laptop's address and sees the titles |
| Fast enough | Upload to titles under 12 s p50 over three test scans, leaving room for 005 |
| No metadata leaves | A Playwright test picks a JPEG with a GPS block; the request body is under 1 MB and the stored object has no metadata |
| Sessions | Two browsers get two tokens; a reload keeps the token |
| Nothing regressed | `research.check` passes; `run` from the CLI unchanged |

## Risks

- **Old phone browsers and the canvas resize.** A browser that cannot
  re-encode falls back to sending the original; the server still resizes,
  and a body over the limit is refused with a message. Logged so the
  fallback rate is known.
- **Local network only.** No scans outside the home until 010; the
  sourced test set in 006 covers shelf variety instead.
