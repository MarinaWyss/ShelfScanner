# 010 — Deployment: Vercel from GitHub

Status: approved 2026-09-02
Date: 2026-09-02
Deadline: 2026-10-14
Spend cap: $5
Track: app (after 008)

## Why

Until now the app runs on the laptop and the phone reaches it over the
local network, which was enough for every test. A public URL is what turns
it into the thing the scoping doc describes: a phone at any shelf. It is
last because nothing before it needed one, and it is small because 003
laid the app out for Vercel's Python runtime from the start.

## What changes

- The repo connected to a Vercel project; production deploys from `main`,
  preview deploys from branches. GitHub Actions still runs the tests; a
  failing check blocks the merge, and Vercel deploys what is merged.
- Environment variables set in Vercel: Supabase URL and service key,
  provider keys, spend cap, admin secret. Nothing in the repo.
- Scheduled jobs: retention (008) as a Vercel cron hitting a protected
  route, daily; the weekly review (009) stays a Claude routine.

### Out of scope

- A custom domain. Later, if shelfscanner.io is to point here.
- Any change to the app. If a Vercel limit bites, that is a finding and
  a follow-up.

## Decisions

**D1. Vercel, because it is already there.** The earlier v1 deployed to it
and the account exists. Its Python runtime runs FastAPI with streaming
responses; Hobby functions run up to 300 s, well past a 15 s scan; the
4.5 MB body limit is handled by the phone-side resize from 003 D5. No
container, no server to keep warm.

**D2. Tests gate the merge, Vercel does the deploy.** Two systems, one
rule: main is always deployable because nothing reaches it untested.

## How we know it worked

| Question | Pass |
|---|---|
| Live | A scan from Marina's phone on mobile data returns five picks under 15 s p50 over three scans |
| Streams | Progress events arrive stage by stage on the deployed URL, not all at the end |
| Automatic | A merge to main is live within ten minutes with no manual step; a branch gets a preview URL |
| Secrets | No key in the repo; the preview and production environments both resolve them |
