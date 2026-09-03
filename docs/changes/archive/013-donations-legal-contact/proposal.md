# 013 — Donations, legal pages, contact

Status: done 2026-09-03 (detailed and built the same day Marina asked, "please move on to task 13", on branch `013-donations-legal-contact`)
Date: 2026-09-03
Deadline: none
Spend cap: $0
Track: app

## Why

The original ShelfScanner (v1) had a donation prompt, a privacy policy, terms
and a contact form. 012 and 014 gave this codebase v1's homepage, preferences
and flow and left those four out on purpose so they could be their own pass.
This change adds them. The privacy policy and the terms are rewritten for what
this app actually does; v1's said things (accounts, adverts, Amazon affiliate
links, a license over "User Content") that were never true of it and are not
true here.

## Decisions

- **D1 The donation is a link, not a modal.** v1 opened a modal with a PayPal
  button. Here "Support Us" is an ordinary link to the same PayPal donate URL
  (business `S8Z878CBE5F3U`, the one in v1's `DonationModal.tsx`), opening
  in a new tab. Nothing to dismiss, nothing to script, nothing to load.
- **D2 Where it sits.** Three places, none of them before the picks: a card
  after the recommendations ("Found the perfect book?", v1's wording without
  the emoji), the bottom of the drawer ("Support ShelfScanner", as v1's
  sidebar had), and the footer. Not in the top bar: on a phone it already
  holds the menu, the brand, the theme toggle and Contact.
- **D3 The pages are static and unsessioned.** `/privacy-policy`,
  `/terms-conditions` and `/contact` are v1's paths, rendered from templates
  with no database access, and added to `UNSESSIONED_PATHS`: reading the
  privacy policy does not create a session row, which is what the policy
  says. "Last updated" is a date written in the template, not today's date
  (v1 printed the current date, which said nothing).
- **D4 The privacy policy is written from the specs.** No account; one
  cookie holding a random token, of which only a hash is stored; the photo in
  a private bucket, sent to the reading model, deleted after 30 days while
  the scan record stays; a hand-labeled test photo kept until removed
  (`photo-storage.md`, Retention); titles sent to Open Library; preferences
  and the picks kept per device; the Goodreads file read once and not stored,
  its titles, authors and ratings kept in the preferences; the model
  providers (Google, Anthropic, OpenAI); Vercel and Supabase as hosts; Google
  Fonts fetched by the browser. No adverts, no analytics, no affiliate links
  (Marina, 2026-09-03: "We won't link to a book seller now").
- **D5 The terms are short and plain.** What the service is, that the picks
  come from AI models and can be wrong, what a user may upload, what we may
  do with a photo (process it and keep it as the privacy policy says), that
  the service is free and provided as is, that it may change or stop, and a
  liability limit. No affiliate section, no content license beyond what the
  photo needs, no governing-law clause: v1's ("your country of residence")
  said nothing, and choosing one is Marina's call, not this change's.
- **D6 Contact is a page with a form that opens the mail client.** v1's form
  did exactly that: it built a `mailto:` from name, email and message and
  set `location.href`. Same here, with the form's own `action` as the
  `mailto:` so it also works without JavaScript. No service, nothing posted
  to the server, nothing stored. The top bar's Contact link goes to the page
  instead of straight to `mailto:`; the address is on the page too.
- **D7 The footer is on every page.** v1 had it on the homepage only. Here
  `base.html` renders it under every page: copyright, Privacy Policy,
  Terms & Conditions, Contact, Support ShelfScanner. A legal page that is
  only reachable from the homepage is not reachable.

## What changes

- `web/app.py`: `GET /privacy-policy`, `GET /terms-conditions`,
  `GET /contact`; `sessions.UNSESSIONED_PATHS` gains the three.
- Templates: `privacy.html`, `terms.html`, `contact.html`; `base.html`
  (footer, drawer link, Contact link, prose and support-card styles);
  `home.html` loses its own footer; `panel.html` gains the support card
  after the picks.
- `static/app.js`: the contact form's submit builds the `mailto:`.
- Tests: the three pages render, set no cookie and carry the expected text;
  the footer links are on the homepage and the scanner; the support link is
  in the done panel; the contact form's action is the `mailto:`.
- Specs: `web.md` Pages and Sessions; `docs/scoping.md` and the roadmap rows.

## How we know it worked

- `uv run pytest -q` green, ruff clean.
- On the preview deployment: each footer link opens its page; the support
  link opens PayPal in a new tab; Send Message on the contact page opens
  the mail client with the subject and body filled; none of the three pages
  sets a cookie (DevTools, Application, Cookies).
