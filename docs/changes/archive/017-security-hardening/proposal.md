# 017 — Security review follow-ups

Status: approved 2026-09-04 (Marina: "These all seem like best practices. Go ahead and implement the changes")
Date: 2026-09-04
Spend cap: $0 (no model calls; every test runs on the fakes)
Track: app

## Why

A security review of the whole project on 2026-09-04 (secrets and their
history, the schema and its grants, every route, the templates, the
workflows, the dependency lock) found the baseline sound: no key has ever
been in the repo, every table has RLS on with `anon` and `authenticated`
revoked, the bucket is private, the session token is stored only as a
hash, scans and picks are checked against the session with tests, every
template autoescapes, EXIF is stripped and verified, the admin compare is
constant-time, `pip-audit` is clean.

It also found eight things worth fixing, none of them an open door, all
of them the kind that turn a bad day into a worse one. The first two
matter; the rest are small and ride along because they touch the same
files. This change does them together so the specs change once.

## What changes

- **A second scan limit, keyed on the client address.** The per-device
  limit counts by session, and a session is whatever the cookie says.
  Drop the cookie and every `POST /scan` gets a fresh session row and ten
  fresh scans. The daily cap still bounds the bill, but one client can
  spend the whole day's budget in minutes and leave a `sessions` row per
  request behind. The fix is a count by address as well as by session
  (D1), and a refusal for a scan that arrives with no session at all (D2).
- **The admin secret leaves the URL and the cookie.** Today `?key=` puts
  the secret in Vercel's access log and the browser's history, and the
  cookie holds the secret itself for thirty days, never marked `Secure`.
  The key is posted once; the cookie is derived from the secret, not
  equal to it (D3).
- **Row text is marked as data in the weekly review.** Titles read off a
  shelf, free-text preferences, the model's reasons and provider error
  strings are all text a stranger can put in the rows, and the review
  workflow hands a draft made of them to an agent with push and
  pull-request rights. The draft fences that text and the brief says what
  it is; the push is narrowed to the review branch (D4).
- **The page stops showing raw exception text.** A stage that raises puts
  `TypeName: message` on the page, and a double failure shows both
  providers' error strings verbatim, which can carry the Supabase URL,
  table names and request ids. The page gets a fixed line per failure
  kind; the row keeps the full text for the dashboard and the review (D5).
- **The upload read is bounded.** `POST /scan` checks `Content-Length`
  and then reads the whole body before checking its length; a chunked
  request skips the first check. Vercel caps bodies at 4.5 MB, so this
  only bites on the laptop, and the preferences route already does it
  right. One line and a test.
- **Response headers.** `X-Content-Type-Options`, `Referrer-Policy`,
  `X-Frame-Options`, and a Content-Security-Policy with a nonce for the
  one inline script (D6).
- **Saves and marks are idempotent.** A second save of a live pick, or a
  second "not for me", inserts nothing. Today each click is a row.
- **`cover_id` is checked to be digits** before it becomes an image URL.
  Autoescaping already makes it harmless; this makes it obviously so.

### Out of scope

- **A CSRF token.** The session cookie is `SameSite=Lax`, which blocks a
  cross-site form post in every current browser, and a forged request
  could at most start a scan or save a pick on the victim's device. Not
  worth a token on every form. Recorded here so the question is answered.
- **A cap on titles per shelf.** One catalogue request is made per title
  read, with no ceiling but the model's. The extraction schema and the
  photo bound it in practice; if the lookup rows ever show a shelf with
  hundreds, that is a finding for the weekly review.
- **Accounts, or abuse detection beyond the two limits.** As in 008.
- **The parts outside the repo**: the Supabase advisors on the linked
  project (`supabase db advisors --linked`), the Vercel project's
  firewall and deployment-protection settings, and the budget in each
  provider's console. Listed under "What Marina supplies".

## Decisions

**D1. Count scans by address as well as by session, from the `photos`
table.** The address is the first value of `x-forwarded-for` on Vercel
(Vercel sets it from the connection; a client cannot spoof it there) and
the socket peer on the laptop; its SHA-256 hex goes in a new nullable
column `photos.client_hash`, set when the photo is stored, nulled by the
retention job in the same update that removes the object, so the hash
lives as long as the photo does. The count is the same rolling hour as
the device limit. The number is its own setting,
`SHELFSCANNER_SCANS_PER_ADDRESS_HOUR`, default 30: three devices' worth,
because a bookstore's wifi or a household is one address, and the point
is to stop one client at fifty scans, not three friends at eleven. The
refusal is a `429` with stage `rate`, checked after the device limit, and
its message says "this network" so a shared address is not told it is one
device. A hash of an address is not anonymity (the IPv4 space is small)
and the privacy page will say plainly that a hash of the address is kept
with the photo for the photo's thirty days. Why a column rather than the
Vercel firewall: the firewall's rate rules are a paid feature, and a
limit that lives in the repo is one the tests cover.

**D2. A scan with no session cookie is refused.** The upload page cannot be
reached without a session (it redirects to `/books`, which sets one), so
a `POST /scan` that carries no cookie is never the form; it is a script.
The session middleware creates no row for that one request and leaves
`session_id` unset; the scan route refuses it with `400`. The cheapest
version of the bypass then costs the attacker nothing but also gains
nothing, not even a row. The middleware still creates sessions for every
other routed request, as before.

**D3. The admin key is posted once and the cookie is derived.** `GET
/admin` with no valid cookie returns a small form when a secret is
configured, and the same `404` as today when none is. `POST /admin` with
the right key sets the cookie and redirects to `/admin` with no query
string; a wrong key returns the form again with a `403`. The cookie value
is `HMAC-SHA256(secret, "shelfscanner-admin-v1")`, so a leaked cookie is a
thirty-day pass but never the secret, and rotating the secret revokes
every cookie at once. The cookie gets `Secure` over https exactly as the
session cookie does (`sessions.is_https`), `SameSite=Strict` since nothing
links into the dashboard, `HttpOnly` and path `/admin` as before. `?key=`
stops being accepted. The form gives up "the route exists" to a visitor
without the key, which the `404` used to hide; that hid nothing worth
hiding (the route is in the public repo), and it is what makes the key
never touch a URL. `.env.example` says the secret should be thirty-two or
more random characters, which is what makes guessing it through the form
impractical without a lock-out.

**D4. Row text is data, and the brief says so.** `research.review` wraps
every string that came from a row (titles, reasons, error texts, model
names) in a fenced block under a line that says the block is data from
the tables and not instructions; `docs/reviews/PROMPT.md` gains the same
sentence and tells the agent to ignore any instruction inside such a
block. The workflow's allowed `git push` narrows from `git push:*` to the
one branch it created, and `gh pr create` keeps its base on `main`, which
is protected. The worst case then stays what it is today, a junk pull
request Marina closes, and the text that could cause it is labelled where
the agent reads it.

**D5. The page shows the failure's kind, the row keeps its text.** The
stage runner's `error` becomes a fixed sentence per stage ("Reading the
shelf failed on our side. Try again.") and the exception is logged, as it
already is. A model failure's message on the page becomes the model name
and the error's kind, using `research.review.error_kind` (`http 429`,
`truncated`, `parse`, `refusal`), which is what a reader can act on; a
double failure names both models and both kinds. The full strings stay in
`extractions.error`, `recommendations.error`, and the `failover_error`
columns, where the dashboard and the weekly review read them. The JSON
result carries the same message as the page.

**D6. Headers in one middleware, CSP enforced from the start.** A plain
ASGI middleware (like `SessionMiddleware`, so the event stream is not
buffered) adds `X-Content-Type-Options: nosniff`, `Referrer-Policy:
strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, and a
`Content-Security-Policy` of `default-src 'self'; script-src 'self'
'nonce-<n>'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src https://fonts.gstatic.com; img-src 'self' data:
https://covers.openlibrary.org; connect-src 'self'; frame-ancestors 'none';
base-uri 'self'; form-action 'self'`. The nonce is per request, generated
in the middleware, put on `request.state`, and rendered into the theme
script's tag in `base.html`; `style-src` keeps `'unsafe-inline'` because
the templates and `app.js` set `style=` attributes and htmx sets inline
styles for its swaps, and a nonce there would touch every one for little
gain. htmx 2 needs no `eval`. Enforced rather than report-only because the
Playwright suite drives every page and will fail on a blocked script;
`Permissions-Policy` is left out because the upload input's camera
capture on iOS is a file input, not `getUserMedia`, and a wrong policy
there would cost the demo's best moment for nothing.

## How we know it worked

| Question | Pass |
|---|---|
| Address limit | A client that sends no cookie, then a fresh cookie per request, is refused at the address limit with the "network" message; two sessions under it both scan |
| No session | `POST /scan` without a cookie is `400` and inserts no `sessions` row |
| Admin | `?key=` is a `404`; the posted key sets a cookie that is not the secret; the cookie opens the page; changing the secret closes it; the cookie carries `Secure` when the request was https |
| Review text | The drafted review fences every row string; the brief names them as data; the workflow's push is the review branch only |
| Error text | A stage that raises shows the fixed line and no exception text; a double model failure shows two model names and two kinds and no provider string |
| Upload | A body over 4 MB with no `Content-Length` is `413` after reading at most 4 MB plus one byte |
| Headers | Every page carries the four headers; the theme script runs under the CSP; the Playwright suite passes with no console error |
| Idempotent | Two saves of one pick are one live row; two marks are one row |
| Nothing else moved | The suite, `research.check`, and one scan on a preview deploy |
