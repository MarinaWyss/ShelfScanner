# 009 — Monitoring: a dashboard from the rows, a weekly review

Status: approved 2026-09-02
Date: 2026-09-02
Deadline: 2026-10-07
Spend cap: $5
Track: either (after 005)

## Why

Every call is already a row. What is missing is a way to see the rows
without writing SQL, and a habit of looking. The scoping doc's section 7
names the metrics and a weekly review; this change builds the page and
schedules the review so it happens without anyone remembering.

## What changes

- A dashboard page at `/admin`, behind a single shared secret in `.env`,
  rendered from the runs, saved and feedback tables: scans per day, save
  rate, not-for-me rate, latency p50 and p95 per stage, cost per scan per
  stage, error rate split model versus application, failover count,
  lookup hit rate. Seven-day and thirty-day windows.
- The price-staleness check from 002 D5 surfaced on the page.
- A weekly scheduled agent (Claude Code routine) that reads the error rows
  and the not-for-me rows since the last run, sorts them into model
  versus application failures, and writes `docs/reviews/<date>.md` with
  counts, examples and a suggested change if a pattern repeats. It opens
  a pull request; it changes no code.

### Out of scope

- Alerting. Best effort, per the scoping doc.
- An observability product.

## Decisions

**D1. The dashboard reads the same tables `report` reads.** One set of
numbers; the CLI report and the page cannot disagree.

**D2. The review writes a file, not a fix.** A pattern becomes a proposal
Marina approves, which keeps rule 1 intact for unattended work.

## How we know it worked

| Question | Pass |
|---|---|
| Numbers match | The page's seven-day figures equal `report`'s over the same rows in a test |
| Review runs | Two consecutive weekly files exist with counts that match the rows |
| Nothing exposed | `/admin` without the secret is a 404 |
