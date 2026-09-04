# 017 — Results

Built 2026-09-04, the day it was approved, on branch `017-security-hardening`.
No model was called; every test runs on the fakes. Migration
`20260904000000_client_hash.sql` pushed to the linked project before the
merge; `supabase db advisors --linked` clean afterwards.

| Question | Pass | Result |
|---|---|---|
| Address limit | A client with no cookie, then a fresh cookie per request, is refused at the address limit with the "network" message; two sessions under it both scan | `test_dropping_the_cookie_does_not_reset_the_limit`, `test_check_counts_the_address_across_sessions_after_the_device`, `test_the_address_is_the_first_forwarded_value_and_is_stored_hashed` |
| No session | `POST /scan` without a cookie is `400` and inserts no `sessions` row | `test_a_cookieless_scan_is_refused_and_makes_no_session` |
| Admin | `?key=` is not a key; the posted key sets a cookie that is not the secret; the cookie opens the page; a new secret closes it; `Secure` over https | `test_the_form_without_the_cookie_and_the_dashboard_with_it`, `test_the_admin_cookie_is_secure_over_https`, `test_admin_page_shows_the_seven_day_table` (browser) |
| Review text | Every row string is fenced under the data note; the brief names it as data; the workflow's push is the review branch only | `test_row_text_is_fenced_as_data`; `weekly-review.yml` allows `git push -u origin review/<date>` and nothing else |
| Error text | A raised stage shows the fixed line and no exception text; a double failure shows two model names and two kinds and no provider string | `test_a_raised_stage_shows_the_fixed_line_and_no_exception_text`, `test_a_double_model_failure_names_both_kinds_and_neither_text`, `test_the_catalogue_checks_own_sentence_is_shown_as_is` |
| Upload | A body over 4 MB with no `Content-Length` is `413` | `test_an_oversized_chunked_body_is_refused_after_a_bounded_read` |
| Headers | Every page carries the four headers; the theme script runs under the CSP; the Playwright suite passes with no console error | `tests/test_web_headers.py` (three tests); the browser suite, theme toggle included, passes under the enforced policy |
| Idempotent | Two saves of one pick are one live row; two marks are one row | `test_save_and_not_for_me_are_idempotent` |
| Nothing else moved | The suite, `research.check`, one scan on a preview deploy | 418 tests pass; `research.check` PASS (latency and cost within 10% of baseline); the preview scan is Marina's, on the pull request's preview URL |

## What changed against the proposal

- **`error_kind` is a fixed vocabulary.** It used to return the first
  forty characters of an error it could not name, which would have put a
  provider's text on the page and in the review's table after all. An
  unnamed error is now `other`; `model`, `provider`, `no candidates` and
  `prompt blocked` joined the list, and `provider 503` groups like
  `http 503`. The full text stays in the row.
- **The review's "Not for me" table became a fenced list.** A markdown
  table cannot sit inside a fence, and the titles in it are row text.
- **The test clients start with a session.** Every scan test's client
  visits `/books` once when it is made, the way the form does; the one
  test of the cookieless refusal builds its own.
- **`img-src` allows `blob:`**: the upload page previews the chosen photo
  from an object URL, which the proposal's policy would have blocked.

## For Marina

- One scan on the pull request's preview URL, to see the headers in the
  browser's network panel and the admin form at `/admin`.
- `SHELFSCANNER_SCANS_PER_ADDRESS_HOUR` in Vercel only if 30 is wrong; the
  default needs nothing. The admin secret should be thirty-two or more
  random characters now that it is typed into a form; if the current one
  is shorter, rotate it in Vercel (every admin cookie is revoked by that,
  which is the point).
- Outside the repo, when convenient: the Vercel project's firewall page,
  and a check that each provider console still has its budget. The
  Supabase advisors were run here and are clean.
