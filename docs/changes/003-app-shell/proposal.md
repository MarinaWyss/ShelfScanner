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
