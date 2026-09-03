# 003 — Results

Written 2026-09-03 by the lead, after the phase's code had been in main for a
day. Tasks 1 to 3 and 5 are done; task 4, the phone test, is Marina's and
is the only thing keeping this change out of the archive. The file should
have existed when tasks 1 to 3 merged; it did not, because the lead treated
the whole close-out as blocked on the phone.

Spec: `docs/specs/web.md` (sessions, upload, events, page),
`photo-storage.md` (session photos), `run-logging.md`.

**Built.** Device-token sessions (hash stored, cookie on first visit);
`POST /scan` with strip, resize and a 4 MB refusal; `GET /scan/{id}/events`
as server-sent events; the htmx page with a canvas resize to 1568 px before
upload; the Vercel layout (`api/index.py`). 008 later added the status lock,
the `last_seen_at` throttle and the `resized_by_client` column that this
change's open issues asked for.

**Measured on the laptop** (real project, real models, the lead's browser
and a curl client; the reading primary has no key yet so every scan read on
Sonnet through failover):

| scan | upload → titles | reading model | note |
|---|---|---|---|
| 140 | ≈ 6 s | Sonnet 5, 4.5 s | choosing then failed on OpenRouter 429 |
| 141 | ≈ 6 s | Sonnet 5, 4.2 s | |
| 142 | ≈ 9 s | Sonnet 5, 7.3 s | dense shelf; `resized_by_client = true` |

Upload to titles p50 about 6 s against the 12 s line. Upload body after the
client resize is under 1 MB.

## Gates

| Question | Pass |
|---|---|
| Works on a phone | **Pending Marina**: three scans from her phone against the laptop's LAN address (task 4) |
| Fast enough | Laptop: upload to titles ≈ 6 s p50 over three real scans (line 12 s). Phone numbers pending |
| No metadata leaves | `tests/e2e/test_scan_page.py`: a GPS-tagged JPEG goes up under 1 MB and the stored object has no EXIF |
| Sessions | `tests/test_web_sessions.py`: two clients get two tokens; a reload keeps the token; live, the same |
| Nothing regressed | `research.check` PASS; the CLI `run` path unchanged (287 → 353 tests over the wave) |

**To close:** Marina runs the server bound to the LAN
(`uv run uvicorn shelfscanner.web.app:app --host 0.0.0.0 --port 8000`),
scans a shelf three times from her phone, and the lead records latency and
upload size here, then archives.
