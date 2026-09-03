# 012 — Tasks

Work in order. Task 1 is a bug and can go first on its own.

## 1. The scan button on iOS

- Drop `required`; `app.js` opens the picker and shows "Choose a photo
  first" on a submit with no file; `POST /scan` with no file or an empty
  one is 400 with the same message as a fragment or JSON.
- Tests: `tests/test_web_scan.py` (the 400), `tests/e2e/` (the click).

## 2. Favicon

- `static/favicon.svg` in the palette; `static/apple-touch-icon.png`
  (180 px) generated from it with Pillow, committed; `<link>`s in
  `base.html`.

## 3. Homepage and `/scan`

- `templates/home.html`; `/` unsessioned (`sessions.UNSESSIONED_PREFIXES`
  or an exact-path rule); the scan page and its routes' redirects at
  `/scan`; nav; `tests/test_web_sessions.py`, `test_web_scan.py`, e2e
  updated; `docs/specs/web.md` Pages.

## 4. Genres and authors

- `prefs.GENRES` = the eighteen; off-list stored genres rendered checked;
  the authors field; `preferences.build`/`upgrade`/`as_text` carry
  `authors`; `docs/specs/preferences.md`.

## 5. Prompt v4 and the comparison

- `prompts/recommend_v4.md`; `recommend.DEFAULT_PROMPT` and
  `web/pipeline.CHOOSING_PROMPT` to v4 after the comparison; the table
  in `results.md`; `docs/specs/recommendation.md`.

## 6. Close

- Playwright green, `research.check` PASS, specs updated, scoping section
  6 and 10 rows, `README.md` current state, archive.
