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
provider keys, the same way the CLI does.

With `SHELFSCANNER_FAKE_PIPELINE=1` the app runs without Supabase or a
provider: sessions, photos, preferences, saves and feedback live in memory
and every scan returns the same fixed titles and picks. That is the mode the
Playwright suite drives.

`api/index.py` re-exports the same `app` for Vercel's Python runtime, which
looks for a FastAPI instance named `app` in an `index` file under `api/`
(deployment is change 010).

## Sessions

A device is identified by a cookie, `shelfscanner_session`, set on the
first response (`HttpOnly`, `SameSite=Lax`, one year, path `/`; no `Secure`
until the app is served over https). The cookie holds a random 32-byte
token; the `sessions` row stores only its SHA-256 hex in `token_hash`,
with `created_at` and `last_seen_at`. Every request that carries a known
token touches `last_seen_at`; an unknown or missing token gets a new row
and a new cookie. Requests under `/static/` do not touch sessions.

Scans, preferences, saves and feedback belong to the session that made
them: another device gets 404 for their ids and an empty saved list.

## Pages

Three server-rendered pages, phone widths first, with htmx (vendored in
`web/static/`; no CDN), sharing a layout with a Scan / Saved / Preferences
nav:

- `GET /` — the scan page. On a session with no preferences row it
  redirects (302) to `/preferences` instead: the first visit sees the
  preferences page. Once a row exists, even an empty one, `/` is the scan
  page.
- `GET /preferences`, `POST /preferences` — see Preferences.
- `GET /saved` — see `feedback.md`.

## Preferences

`GET /preferences` shows twelve genre checkboxes (`web/prefs.py:GENRES`),
a free-text line, and a file field for a Goodreads export, filled in from
the session's stored object; when an export has been imported it says how
many rated books and to-read titles are on file. On a first visit (no row)
it also offers "Skip for now".

`POST /preferences` is a multipart form with `genres` (repeated), `free_text`,
optional `goodreads` (the CSV) and optional `action=skip`. It builds the
preferences object of `preferences.md` and stores it as the session's row
through the importer's functions, then redirects (303) to `/`:

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

## Upload

`POST /scan`, multipart with a `photo` file and a `resized` field (`1` when
the page shrank the photo in the browser, otherwise `0`, which is logged
so the fallback rate is known).

1. A body over 4 MB is refused with 413 and a message; a file Pillow
   cannot open is refused with 400.
2. The image is re-encoded with `images.resize`: EXIF orientation applied
   to the pixels, long edge at most `default_max_edge` from
   `config/models.toml` (1568 px), JPEG quality 95, no EXIF and no XMP.
   This is a no-op resize when the page already did it.
3. The bytes go to the `shelf-photos` bucket under
   `sessions/<session id>/<uuid>.jpg` and a `photos` row is inserted with
   `session_id` set and no labels. Upload is refused if metadata survived.

The response is `201` with `{"id": <photo id>, "status": "pending"}`, or,
for htmx requests (the `HX-Request` header), the progress panel as HTML.
Errors are `{"error": <message>, "stage": "uploading"}` or an HTML fragment
saying the same. The scan id is the `photos` row id.

## Events

`GET /scan/{id}/events` is a `text/event-stream`. Both model stages run
inside this request, so nothing is held in memory between requests and
the same code works as one uvicorn process or as a Vercel function.

Events, in order:

- `uploaded` — the photo is stored.
- `reading` — the vision model is being called through the router
  (`stages.reading` primary in config, prompt `extract_v1`). Repeated with
  a note whenever the adapter reports progress.
- `choosing` — the language model is being called through the router
  (`stages.choosing` primary with failover, prompt `recommend_v2`,
  `web/pipeline.py:CHOOSING_PROMPT`) with the extraction and the session's
  preferences, via `recommend.recommend_from_extraction`. Repeated with
  progress notes. Skipped when no titles were read.
- `done` — the picks are in; or `failed` — the error, naming the stage
  that failed (reading or choosing).
- `close` — always last; tells the page to stop listening.

Each event's data is the rendered progress panel (HTML): four rows (photo
uploaded, reading the shelf, choosing five for you, picks ready) with done,
active, failed or pending marks, then the result. A comment line is sent
every 15 s while a model is working so proxies keep the connection open.

The handoff from reading to choosing is one place in `web/scan.py:_events`,
marked in the code; the reading's titles are what the choosing stage is
given (a verification step between the two is change 007's).

Preferences for the scan are the session's stored object. When it is empty
or there is no row, the object sent carries the taste-unknown note in
`free_text` (`web/pipeline.py:UNKNOWN_TASTE`), so the model is told the
taste is unknown and the logged `preferences` column is exactly what it
was given. Nothing is stored for the session in that case.

Connecting again for a scan that already has a result replays `done` or
`failed` at once without calling a model. Connecting again after the
reading finished but before the choosing did runs the choosing only. A
failed choosing is not retried.

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
"reading" | "choosing", "error": ...}`; for htmx requests the same as HTML.
404 when the id is not one of the session's scans.

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
- Error responses (400, 413, 500) are shown in the same place.

## The pipeline boundary

The routes call only `web/pipeline.py:Pipeline`: `store`, `photo`, `read`,
`choose`, `result` for the scan; `preferences`, `save_preferences`;
`recommendation`, `pick_states`, `save`, `unsave`, `mark`, `saved` for
feedback. `SupabasePipeline` is the real one; `fakes.FakePipeline` keeps
the same rows in memory, shaped like the tables.

## Metrics

`web/metrics.py:save_rate(session_id=None)` returns saves per scan and
not-for-me marks per pick from the rows (`feedback.md`); `compute` is the
pure part over rows shaped like the tables.

## Tests

`tests/test_web_sessions.py`, `test_web_scan.py`, `test_web_prefs.py` and
`test_web_picks.py` run the app through FastAPI's test client with
`web.fakes` (in-memory sessions and pipeline, a fake model client behind
the router for both stages). `tests/e2e/` starts uvicorn in a thread with
the same fakes and drives Chromium with Playwright: preferences with an
export, photo to five picks with the stages visible, save two, unsave one,
mark one, the saved list; a GPS-tagged 3 MB JPEG arriving under 1 MB with
no metadata stored and the orientation applied; a failing model naming its
stage, for either stage; two browsers getting two sessions.
`uv run playwright install chromium` once before the first run.
