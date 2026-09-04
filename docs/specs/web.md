# Web app

The pages a phone uses to turn a shelf photo into five picks, save them, and
say which were wrong. Package `src/shelfscanner/web/`; the ASGI app is
`shelfscanner.web.app:app`.

## Running it

```
uv run uvicorn shelfscanner.web.app:app --host 0.0.0.0 --port 8000
```

Bound to `0.0.0.0`, the laptop's address on the local network (for example
`http://192.168.1.20:8000`) opens the page on a phone on the same Wi-Fi.
Add `--reload` while editing. The app reads `.env` for Supabase and the
provider keys, the same way the CLI does, and for the three scan limits
(`SHELFSCANNER_SCANS_PER_HOUR`, `SHELFSCANNER_SCANS_PER_ADDRESS_HOUR`,
`SHELFSCANNER_APP_DAILY_CAP_USD`; see Limits).

With `SHELFSCANNER_FAKE_PIPELINE=1` the app runs without Supabase or a
provider: sessions, photos, preferences, saves and feedback live in memory
and every scan returns the same fixed titles and picks. That is the mode the
Playwright suite drives.

`index.py` at the repository root re-exports the same `app` for Vercel's
FastAPI preset (`deployment.md`).

## Sessions

A device is identified by a cookie, `shelfscanner_session`, set on the
first response (`HttpOnly`, `SameSite=Lax`, one year, path `/`; `Secure`
when the request came over https, 010). The cookie holds a random 32-byte
token; the `sessions` row stores only its SHA-256 hex in `token_hash`,
with `created_at` and `last_seen_at`. A request that carries a known token
touches `last_seen_at` when the stored value is ten minutes old or more
(`web/sessions.py:LAST_SEEN_THROTTLE_S`), so a page of requests writes the
row once, not once per request; an unknown or missing token gets a new row
and a new cookie. Requests under `/static/` and `/admin` do not touch
sessions, and neither does the homepage, the privacy policy, the terms or
the contact page (`UNSESSIONED_PATHS`; 012 D1, 013 D3), nor a request no
route serves (a 404, a crawler, `/favicon.ico`): those get no row and no
cookie.

Scans, preferences, saves and feedback belong to the session that made
them: another device gets 404 for their ids and an empty saved list.

One request must already carry a cookie: a `POST /scan` with none gets no
row and no cookie, and the route refuses it with 400 (017 D2,
`sessions.NO_FRESH_SESSION`). The upload form cannot be reached without a
session, so a cookieless upload is a script, and making it a row would
make it a fresh device with fresh limits. A cookie whose token is unknown
(a deleted row, a restart of the in-memory store) is a browser that did
come through the form, and gets a fresh session like any other request.

## Pages

Server-rendered pages with htmx (vendored in `web/static/`; no CDN),
laid out and worded as the earlier ShelfScanner (v1) was (014): a sticky
top bar with a menu button, the brand and a Contact link; a drawer with
Home, Book Scanner and Reading List and, at its foot, Support ShelfScanner
(013); under every page a footer with the copyright line, Privacy Policy,
Terms & Conditions, Contact and Support ShelfScanner; a favicon (`static/favicon.svg`)
and an iPhone home-screen icon (`static/apple-touch-icon.png`); the
"ShelfScanner Warm Redesign" look (015): paper and olive, Domine for
headings and Karla for the rest, hatched paper-deep cards, and a derived
dark set. The header's Dark/Light toggle (016) chooses the set and the
choice is kept on the device; until a choice is made the system setting
decides, and without JavaScript the page is light.

- `GET /` — the homepage: the v1 hero, the "AI Book Discovery" card,
  "How It Works", "Start Using ShelfScanner Today".
  It is unsessioned (012 D1): no `sessions` row and no cookie until the
  visitor opens a page that needs one.
- `GET /books` — the Book Scanner, step 1 of three: the preferences form
  (see Preferences), prefilled from the session's row when there is one.
  The stepper above it shows Preferences · Book Upload · Recommendations.
- `GET /books/upload` — step 2: the upload box. With no preferences row
  it redirects (302) to `/books`: the first visit sees the preferences
  first (005 D2). The file input has no `required` attribute (iOS Safari
  enforces it without a word): a submit with no photo is caught by
  `app.js`, which shows "Choose a photo first." and opens the picker, and
  `POST /scan` without a file answers 400 with the same message and stage
  `uploading`. Choosing a photo shows it in the box; Get Recommendations
  posts it. The result (step 3) replaces the upload step in place and
  moves the stepper to 3; Scan More Books returns to step 2; a refusal
  before any stage ran puts the form back.
- `GET /preferences`, `POST /preferences` — the same step 1 page and the
  form's action; see Preferences.
- `GET /reading-list` — see `feedback.md`.
- `GET /privacy-policy`, `GET /terms-conditions` — static pages (013),
  dated in the template. The policy is written from these specs: the
  cookie, the photo and its 30-day retention, Open Library, the
  preferences and the Goodreads file, the providers, the hosts, Google
  Fonts; no adverts, analytics or affiliate links. The terms: what the
  service is, that the picks are AI output, what may be uploaded, fair use
  under the rate limit and the daily cap, as-is availability, a liability
  limit. No governing-law clause.
- `GET /contact` — the contact page: name, email and message; Send Message
  opens the mail app with the subject and body filled (`app.js`; the
  form's own `action` is the `mailto:`, so it works without JavaScript).
  Nothing is posted to the server; the address is on the page too.
- The Support links (the drawer, the footer, and the "Found the perfect
  book?" card after the picks, never before them) are one PayPal donate
  URL (`app.DONATE_URL`) opened in a new tab. No modal.
- `GET /scan` → `/books/upload` and `GET /saved` → `/reading-list`, both
  301: the addresses from 003 to 012.

## Preferences

Step 1 of `/books` (also `GET /preferences`) is v1's preferences step:
"Tell us about your reading preferences", eighteen genre buttons
(`web/prefs.py:GENRES`, the original's list, 012 D4; a stored genre that
is not on the list is rendered as its own chosen button so nothing saved
is lost), "Add favorite authors (optional)" with a box, an Add button and
a chip per author with a remove ×, and the Goodreads card ("Import your
Goodreads library (Optional)", the download link to
goodreads.com/review/import, the desktop-only note, the file field), all
filled in from the session's stored object; when an export has been
imported the card says how many rated books and to-read titles are on
file. The page has no free-text field (v1 had none); the object keeps
`free_text` for the CLI. Continue is never disabled (014 D3).

`POST /preferences` is a multipart form with `genres` (repeated), `authors`
(the chip list as one string, split on commas and newlines, trimmed,
empties dropped, a repeat kept once in its first spelling:
`prefs.split_authors`), `authors_extra` (what is still typed in the box;
appended to `authors`), optional `free_text`, optional `goodreads` (the
CSV) and optional `action=skip`. It builds the preferences object of
`preferences.md` and stores it as the session's row through the
importer's functions, then redirects (303) to `/books/upload`:

- With an export: the CSV is decoded from the request body and parsed in
  memory (`preferences.rows_from_export`); `preferences.build` turns it
  into `rated_books`, `to_read` and `avoid` (the did-not-finish entries),
  with the genres and free text from the form. The file is never written
  anywhere and nothing from it but the object is stored (scoping R4). A
  file without the export's columns is refused with 400 and the page
  re-rendered with a message; nothing changes.
- Without one: `genres` and `free_text` replace the stored ones and the
  rest of the object is kept, so an import survives later edits.
- `action=skip`: the stored object, or an empty one, is written unchanged.
  That is what makes the first-visit redirect stop.

A scan with an empty object still runs (005 D2): see Events.

## Limits

Three limits guard `POST /scan`, all read at startup from the environment
or `.env` by `web/limits.py:from_env` (a value that is not a number refuses
to start), all checked before the upload is read and before anything is
stored, all refused with a message that states the number (008 D1):

- **Scans per device per hour**: `SHELFSCANNER_SCANS_PER_HOUR`, default
  10. The count is the session's `photos` rows created in the last hour at
  the moment of the request (a rolling window; refused uploads store no
  row and do not count). At or over the limit the response is `429` with
  stage `rate`: "This device has scanned N shelves in the last hour, and
  the limit is N per hour. Try again in a while."
- **Scans per network address per hour** (017 D1):
  `SHELFSCANNER_SCANS_PER_ADDRESS_HOUR`, default 30. The address is the
  last value of `x-forwarded-for` (the nearest proxy's; Vercel overwrites
  the header with the connection's address), else the socket peer, so
  with no proxy in front the header is the client's to write and the
  limit is only as good as the daily cap under it; its SHA-256 hex is stored on the `photos` row as
  `client_hash` and the count is the rows with that hash in the last hour,
  every session together (one read serves both counts; the column is
  indexed with `created_at`, partial on non-null). A session is whatever
  the cookie says; the address is what the connection says, so dropping
  the cookie does not reset the count. The refusal is `429` with stage `rate`: "This network
  has scanned N shelves in the last hour, and the limit is N per hour for
  one network. Try again in a while." Skipped when no address is known.
  The hash is removed by retention with the photo (`photo-storage.md`) and
  the privacy page says it is kept.
- **The app's daily spend**: `SHELFSCANNER_APP_DAILY_CAP_USD`, default 5.
  `cost_usd` summed over the `extractions` and `recommendations` rows of
  photos with a session stored since midnight UTC, every session
  together; research and nightly runs have no session and count against
  the CLI cap instead. At or over the cap the response
  is `503` with stage `cap`: "ShelfScanner has spent $X on scans today,
  which reaches its daily limit of $Y. Scans start again tomorrow (UTC)."

The device limit is checked first, then the address, then the budget, so
a device at its limit is told that even when the app is also out of
budget. The CLI's spend cap
(`SHELFSCANNER_SPEND_CAP_USD`, `run-logging.md`) does not apply to the app:
the web pipeline calls the stages with `guard=False`, so the CLI's
`SystemExit` can never reach the event loop. A stage that raises anything,
`SystemExit` included, is reported as a failed scan and the row goes back
to `pending` for a retry; the server stays up.

## Upload

`POST /scan`, multipart with a `photo` file and a `resized` field (`1` when
the page shrank the photo in the browser, otherwise `0`). In order:

1. A request with no session cookie is refused with 400 (017 D2).
2. A body over 4 MB is refused with 413: by `Content-Length` when there
   is one, and by reading at most 4 MB plus one byte of the file when
   there is not (a chunked body).
3. The limits above are checked; a refusal is 429 or 503.
4. The file is refused with 400 unless its declared content type is
   `image/jpeg` or `image/png`, its bytes decode as a JPEG or PNG (a
   header claiming a decompression-bomb size counts as not an image; the
   bytes decide: a GIF named `.jpg` is refused as a GIF; a phone JPEG with
   an embedded second picture, which Pillow calls MPO, is a JPEG), and its long edge
   is at least 400 px (`web/scan.py:MIN_LONG_EDGE`; the message gives the
   dimensions). Only the header is read for this.
5. The image is re-encoded with `images.resize`: EXIF orientation applied
   to the pixels, long edge at most `default_max_edge` from
   `config/models.toml` (1568 px), JPEG quality 95, no EXIF and no XMP.
   This is a no-op resize when the page already did it.
6. The bytes go to the `shelf-photos` bucket under
   `sessions/<session id>/<uuid>.jpg` and a `photos` row is inserted with
   `session_id` set, no labels, `status = 'pending'`, `client_hash` (the
   address hash of the Limits section, 017 D1) and `resized_by_client`
   from the form field (true for `1`), so the browser-resize fallback
   rate can be read from the table. Upload is
   refused if metadata survived. A store failure is 500 with a retry.

The response is `201` with `{"id": <photo id>, "status": "pending"}`, or,
for htmx requests (the `HX-Request` header), the progress panel as HTML.
Refusals are `{"error": <message>, "stage": "uploading" | "rate" | "cap"}`
or an HTML fragment with a heading (Upload refused, Scan limit reached,
Daily budget reached), the message and the same stage in `data-stage`.
The scan id is the `photos` row id.

## Events

`GET /scan/{id}/events` is a `text/event-stream`. Both model stages run
inside this request, so nothing is held in memory between requests and
the same code works as one uvicorn process or as a Vercel function.

Events, in order:

- `uploaded` — the photo is stored.
- `reading` — the vision model is being called through the router
  (`stages.reading` primary with failover, prompt `extract_v1`). Repeated
  with a note whenever the adapter or the failover reports progress.
- `checking` — the titles read are being checked against the catalogue
  (`book-lookup.md`), the first part of the pipeline's choosing.
- `choosing` — the language model is being called through the router
  (`stages.choosing` primary with failover, prompt `recommend_v3`,
  `web/pipeline.py:CHOOSING_PROMPT`) with the verified titles and the
  session's preferences, via `recommend.recommend_from_extraction`.
  Repeated with progress notes. Skipped, with `checking`, when no titles
  were read.
- `done` — the picks are in; or `failed` — the error, naming the stage
  that failed (reading, checking or choosing).
- `close` — always last; tells the page to stop listening.

Each event's data is the rendered progress panel (HTML): five rows (photo
uploaded, reading the shelf, checking the titles, choosing five for you,
picks ready) with `todo`, `active`, `done` or `failed` marks, then the result.
A comment line is sent every 15 s while a model is working so proxies keep
the connection open.

**The stage lock.** `photos.status` says what is happening to the scan:
`pending`, `reading`, `choosing`, `done`, `failed`, with `status_at` the
time it was set. Before running a stage the connection claims it: one
atomic update that sets the status to the stage when the scan is
claimable, and fails when it is not. A `reading` is claimable from
`pending`; a `choosing` from `pending` or `reading` (the reading finished,
or its connection died). A `reading` or `choosing` claim older than three
minutes (`web/pipeline.py:STALE_CLAIM_S`) is stale and claimable too. A
connection that cannot claim shows the stage with the note "Already
running for this photo on another connection; waiting for it", looks
again every second (`web/scan.py:POLL_S`), and either replays the result
when it appears or takes the stage over when the claim goes stale. So a
second connection while a stage is in flight never runs a model a second
time. The stage runners write the status the stage leaves behind
(`failed`, `done`, or `reading` when titles were read and the choosing is
not yet claimed) from the worker thread, so the row is right even when
the browser left before the stage finished; a stage that raised puts the
status back (`pending`, or `reading` for the choosing) so a reconnect can
try again.

**Failures.** A failed stage's panel names the stage ("Reading the shelf
failed", "Checking the titles failed", "Choosing failed"), says what
failed, and offers "Try again", which submits the form again and starts a
new scan of the photo still in the picker (a new `photos` row; the failed
one keeps its status). A model failure is shown as the model and the
error's kind (`errors.error_kind`: `http 429`, `truncated`, `parse`,
`timeout`, ..., or `other`), never the provider's text, which can carry a
URL or a request id (017 D5): "<slug> failed: <kind>." When the stage
failed over and the fallback failed too (the row has `failover_from` and
`failover_error`), both are named: "Both models failed. <primary slug>:
<kind>. Then <fallback slug>: <kind>." The full text stays in the row for
the dashboard and the weekly review. The app's own sentences are shown as
they are: the checking step's, when every title read was dropped by the
catalogue check; and a stage that raised, which shows "Reading the shelf
failed on our side. Try again." or "Choosing failed on our side. Try
again." (`scan.RAISED`) while the exception goes to the log. Nothing the
page shows was not checked: picks are the verified picks of
`recommendation.md`, and errors are the rows'.

The handoff from reading to choosing is one place in `web/scan.py:_events`,
marked in the code; the reading's titles are what the choosing stage is
given, and the catalogue check (007) runs first inside the pipeline's
choosing.

Preferences for the scan are the session's stored object. When it is empty
or there is no row, the object sent carries the taste-unknown note in
`free_text` (`web/pipeline.py:UNKNOWN_TASTE`), so the model is told the
taste is unknown and the logged `preferences` column is exactly what it
was given. Nothing is stored for the session in that case.

Connecting again for a scan that already has a result replays `done` or
`failed` at once without calling a model. A choosing that failed before
any model ran (the catalogue check dropped every title, or the list was
empty) still writes a `recommendations` row, with the error prefixed by
the step (`checking: ...`), so the replay has something to read. Connecting again after the
reading finished but before the choosing did runs the choosing only. A
failed choosing is not retried on the same scan; "Try again" starts a new
one.

An extraction row and a recommendation row are logged exactly as the CLI
logs them (`extraction.md`, `recommendation.md`); with no labels, every
title read counts as `invented` and every pick as not matching ground
truth, which the report and `research.check` ignore because they filter
to labelled photos.

## Result

`GET /scan/{id}` returns `{"id", "status": "pending"}` while either stage
is still to run, `{"status": "done", "titles": [...], "recommendation_id",
"picks": [{"title", "reason", "saved", "not_for_me"}]}` (with no titles:
empty `picks`, null `recommendation_id`), or `{"status": "failed", "stage":
"reading" | "checking" | "choosing", "error": ...}`; for htmx requests the
same as HTML. 404 when the id is not one of the session's scans.

The done panel shows the picks (heading "Five for you", or "Picks for you"
when the shelf had fewer than five books) each with its reason and its
Save and Not-for-me controls (`feedback.md`), then every title read under a
collapsed "All N titles read from the shelf".

## The scan page

- A file picker (`accept="image/*"`, so the phone offers the camera or the
  library) and one button.
- On choosing a file the page decodes it with the EXIF orientation applied
  (`createImageBitmap`, falling back to an `<img>`), draws it on a canvas
  at a 1568 px long edge and re-encodes as JPEG at quality 0.85. The
  re-encode carries no metadata, so nothing but pixels leaves the phone.
  If any step fails the original file is sent with `resized=0` and the
  server does the work.
- Submitting posts the form through htmx; the response panel connects to
  the event stream and swaps each event into place.
- Error responses (400, 413, 429, 500, 503) are shown in the same place.
  "Try again" submits the form through the browser's validation, so with
  no photo chosen the picker is flagged rather than an empty request sent.

## The pipeline boundary

The routes call only `web/pipeline.py:Pipeline`: `store`, `photo`, `claim`,
`set_status`, `read`, `choose`, `result` for the scan; `scan_count`,
`spent_since` for the limits; `preferences`, `save_preferences`;
`recommendation`, `pick_states`, `save`, `unsave`, `mark`, `saved` for
feedback. `SupabasePipeline` is the real one (the claim is one `update`
with the claim rule as its filter); `fakes.FakePipeline` keeps the same
rows in memory, shaped like the tables, goes through `router.with_failover`
so the failover is exercised, and takes a clock. `claimable` in the same
module is the claim rule as a function, shared by the fake and the tests.

## Headers

Every response the app produces, the event stream, static files and 404s
included, carries (`web/headers.py`, the outermost of the app's
middleware, 017 D6; the plain 500 Starlette sends when a route raises past
the app is made outside the stack and has none):

- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `X-Frame-Options: DENY`
- `Content-Security-Policy: default-src 'self'; script-src 'self'
  'nonce-<nonce>'; style-src 'self' 'unsafe-inline'
  https://fonts.googleapis.com; font-src https://fonts.gstatic.com;
  img-src 'self' data: blob: https://covers.openlibrary.org; connect-src
  'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'
  mailto:` (the contact form's action is a `mailto:`)

The nonce is new for every request and is the one on the inline theme
script in `base.html` (`{{ csp_nonce() }}`, a template global reading the
request's context variable); no other inline script exists. Inline styles
stay allowed because the templates, `app.js` and htmx set `style=`; the
photo preview is a `blob:` URL. Tests: `tests/test_web_headers.py`, and
the Playwright suite runs every page under the policy.

## Metrics

`web/metrics.py:save_rate(session_id=None)` returns saves per scan and
not-for-me marks per pick from the rows (`feedback.md`); `compute` is the
pure part over rows shaped like the tables.

## Tests

`tests/test_web_sessions.py`, `test_web_scan.py`, `test_web_limits.py`,
`test_web_prefs.py` and `test_web_picks.py` run the app through FastAPI's
test client with `web.fakes` (in-memory sessions and pipeline, a fake model
client behind the router for both stages, a fixed clock for the limits, the
lock and the `last_seen_at` throttle). `tests/e2e/` starts uvicorn in a
thread with the same fakes and drives Chromium with Playwright: preferences
with an export, photo to five picks with the stages visible, save two,
unsave one, mark one, the saved list; a GPS-tagged 3 MB JPEG arriving under
1 MB with no metadata stored and the orientation applied; a failing model
naming its stage, for either stage; two browsers getting two sessions; the
third scan in an hour refused with the number; a provider failure after
failover naming both attempts and a retry that starts a new scan; an
oversized and a non-image upload refused before the store.
`uv run playwright install chromium` once before the first run.
