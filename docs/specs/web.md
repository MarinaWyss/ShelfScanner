# Web app

The page a phone uses to turn a shelf photo into a list of titles. Package
`src/shelfscanner/web/`; the ASGI app is `shelfscanner.web.app:app`.

## Running it

```
uv run uvicorn shelfscanner.web.app:app --host 0.0.0.0 --port 8000
```

Bound to `0.0.0.0`, the laptop's address on the local network (for example
`http://192.168.1.20:8000`) opens the page on a phone on the same Wi-Fi.
Add `--reload` while editing. The app reads `.env` for Supabase and the
provider keys, the same way the CLI does.

With `SHELFSCANNER_FAKE_PIPELINE=1` the app runs without Supabase or a
provider: sessions and photos live in memory and every scan returns the
same fixed titles. That is the mode the Playwright suite drives.

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

Scans belong to the session that made them: another device gets 404 for
their ids.

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

`GET /scan/{id}/events` is a `text/event-stream`. The reading stage runs
inside this request, so nothing is held in memory between requests and
the same code works as one uvicorn process or as a Vercel function.

Events, in order:

- `uploaded` — the photo is stored.
- `reading` — the vision model is being called through the router
  (`stages.reading` primary in config, prompt `extract_v1`). Repeated with
  a note whenever the adapter reports progress.
- `done` — the titles are in; or `failed` — the error, naming the stage.
- `close` — always last; tells the page to stop listening.

Each event's data is the rendered progress panel (HTML). A comment line is
sent every 15 s while the model is working so proxies keep the connection
open. Connecting again for a scan that already has a result replays
`done` or `failed` at once without calling the model again.

An extraction row is logged exactly as `shelfscanner extract` logs one
(see `extraction.md`); with no labels, every title read counts as
`invented`, which the report and `research.check` ignore because they
filter to labelled photos.

## Result

`GET /scan/{id}` returns `{"id", "status": "pending"}`,
`{"status": "done", "titles": [...]}` or
`{"status": "failed", "stage": "reading", "error": ...}`; for htmx requests
the same as HTML. 404 when the id is not one of the session's scans.

## Page

`GET /` is one server-rendered page, phone widths first, with htmx (vendored
in `web/static/`; no CDN):

- A file picker (`accept="image/*"`, so the phone offers the camera or the
  library) and one button.
- On choosing a file the page decodes it with the EXIF orientation applied
  (`createImageBitmap`, falling back to an `<img>`), draws it on a canvas
  at a 1568 px long edge and re-encodes as JPEG at quality 0.85. The
  re-encode carries no metadata, so nothing but pixels leaves the phone.
  If any step fails the original file is sent with `resized=0` and the
  server does the work.
- Submitting posts the form through htmx; the response panel connects to
  the event stream and swaps each event into place: three rows (photo
  uploaded, reading the shelf, titles ready) with done, active, failed or
  pending marks, then the titles as a list or an error naming the stage.
- Error responses (400, 413, 500) are shown in the same place.

## Tests

`tests/test_web_sessions.py` and `tests/test_web_scan.py` run the app
through FastAPI's test client with `web.fakes` (in-memory sessions and
pipeline, a fake model client behind the router). `tests/e2e/` starts
uvicorn in a thread with the same fakes and drives Chromium with
Playwright: photo to titles with the stages visible, a GPS-tagged 3 MB
JPEG arriving under 1 MB with no metadata stored and the orientation
applied, a failing model naming its stage, two browsers getting two
sessions. `uv run playwright install chromium` once before the first run.
