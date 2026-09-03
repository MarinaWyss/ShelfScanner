# 013 — Donations, legal pages, contact

Status: proposed 2026-09-03 (Marina asked for it as the change after 012); to be detailed and approved once 012 is archived
Date: 2026-09-03
Deadline: after 012
Spend cap: $0
Track: app

## Why

The original ShelfScanner had a donation prompt, a privacy policy, terms,
and a contact form. 012 gives this codebase the homepage and the
preferences the original had and leaves those four out on purpose; this
change adds them, as their own pass, so 012 stays small.

## What changes (to be detailed)

- A donation link or prompt, where and how to be decided (the original
  used PayPal and a modal after the picks).
- A privacy page that says what this app actually does: no account, a
  device cookie, the photo in a private bucket deleted after thirty days,
  a Goodreads export read once and not stored, model calls to the
  providers named in `config/models.toml`, no ads, no affiliate links
  unless that decision changes here.
- A terms page.
- A contact route: a mailto link at least; a form only if it needs no
  third-party service.

### Open questions for the detailed proposal

- Whether the picks page links to a bookseller (affiliate or not), which
  changes what the privacy page has to say.
- Where the donation prompt sits so it does not get in the way of a scan.

## How we know it worked

Filled in with the detail.
