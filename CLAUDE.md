# ShelfScanner

An app that recommends books from a photo of a shelf. See `docs/scoping.md` for
the problem, constraints, and success metrics. Read it before proposing anything.

## How we work

Specs live in files, not in chat. Chat is gone next session; files aren't.

- `docs/scoping.md` — project-level why and what. The source of constraints.
- `docs/specs/` — how the system behaves today. One file per capability.
- `docs/changes/` — one numbered folder per proposed change, containing
  `proposal.md` (why, and what changes) and `tasks.md` (the steps). Larger
  changes also get `design.md` (how).
- `docs/changes/archive/` — completed changes.

## Rules

1. No implementation code until there is a proposal in `docs/changes/` that I
   have approved. If I ask for code without one, write the proposal first and ask.
2. Work the task list in order, one task at a time. Stop after each for review.
3. When a change is complete, update `docs/specs/` to match what is now true and
   move the change folder to `docs/changes/archive/`.
4. Specs describe behavior. Proposals record decisions. Don't mix them.
