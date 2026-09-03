# 008 — Tasks

Work in order. ∥ marks tasks that can run in parallel worktrees.

## 1. Limits ∥

- Per-session scans per hour and a daily spend cap, both from config;
  messages on the page; tests with a clock and a seeded runs table.

## 2. Errors and validation ∥

- Audit each stage's failure path to the page; provider failure after
  failover shows a retry; input validation before the bucket.

## 3. Retention ∥

- Scheduled job (GitHub Actions until 010, Vercel cron after) deleting objects older than
  the config window, nulling `storage_path`, exempting labelled photos.

## 4. Caching decision

- Read 007's lookup latency and cost from the rows; apply the line; build
  the `books`-first lookup only if crossed. Either way, results.md.

## 5. Specs, results, archive

- `docs/specs/web.md`, `photo-storage.md`, and `book-lookup.md` if cached.
