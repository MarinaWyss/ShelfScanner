# 003 — Tasks

Work in order. ∥ marks tasks that can run in parallel worktrees.

## 1. Sessions and schema

- Migration: `sessions` (id, token hash, created_at, last_seen_at);
  `photos.session_id` nullable foreign key. Grants as before.
- Session middleware: cookie token, row on first visit.

Done when: a test client gets a cookie and a row; a second request reuses it.

## 2. Upload and extract endpoint ∥

- `POST /scan`: accept an image, strip and resize with the image module
  (a no-op when the phone already did it), refuse a body over 4 MB with
  a message, upload to the bucket under `sessions/<id>/`, insert the
  `photos` row,
  run extraction through the router with a progress callback, return the
  scan id.
- `GET /scan/{id}/events`: server-sent events for the four stages.
- `GET /scan/{id}`: the titles read, or the error naming the stage.

Done when: tests cover the metadata strip, the row, and the error path
with a fake router.

## 3. Page ∥

- One template: photo picker, progress list, titles list. htmx for the
  events and the result. Phone widths first.
- Client resize: canvas re-encode to 1568 px JPEG before the request,
  orientation applied; fall back to the original if the browser cannot.
- Playwright suite: pick a test photo against a local server with a fake
  router, see progress, see titles; pick a GPS-tagged JPEG, check the
  request size and the stored object.

Done when: the suite passes in CI.

## 4. Phone test

- Vercel-shaped entry point checked with a local `vercel dev` run if the
  CLI is installed; otherwise noted for 010.
- Server bound to the local network; three scans from Marina's phone of
  a shelf at home, latencies recorded, upload size recorded.

Done when: the phone shows titles for a photo it just took.

## 5. Specs, results, archive

- `docs/specs/web.md` (sessions, upload, events, page), `photo-storage.md`
  updated for session photos, `run-logging.md` for the new columns.
- `results.md` with the acceptance table filled in.
