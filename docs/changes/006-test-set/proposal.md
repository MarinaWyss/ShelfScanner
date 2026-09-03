# 006 — Test set: sourced shelf photos, nightly eval, the lookup decision

Status: approved 2026-09-02
Date: 2026-09-02
Deadline: 2026-09-23
Spend cap: $15
Track: quality (parallel with 005)

## Why

Five photos of one person's shelves in good light said "keep going". The
user is in a bookstore: glare, angles, stock the model has never seen. This
change grows the set to where a result means something, makes the eval run
without anyone typing, and uses the result to decide whether the book
lookup is a verification step the system needs or an enrichment step it
merely wants.

## What changes

- 30 to 50 shelf photos sourced from openly licensed images: Wikimedia
  Commons and Openverse (CC0, CC BY, public domain), searched for
  bookstore, library and home shelves, glare, angles, stacks, non-English
  spines. Each photo's URL, author and licence go in its label file;
  the image itself stays in `data/photos/` and out of the repo like the
  others, and a `photos fetch` command re-downloads the set from the
  label files.
- Labels drafted by an agent from the photo at full resolution, marked
  `provisional: true`. Marina may confirm any; the report shows the two
  populations separately.
- Degraded copies of the existing five photos (blur, glare overlay,
  rotation, 1024 px) as a second set, so the effect of conditions can be
  measured on shelves whose labels are already confirmed.
- Overlap is reported only over photos that have Marina's picks, which
  stays the original five.
- A nightly GitHub Actions job that runs `research.check` on the full set
  with the primary models and posts the numbers to the run summary. Cost
  cap per run.
- The lookup decision: over every extraction by the primary reading model
  on the sourced set, the degraded set and any home scans from 003
  onward, count invented titles. The rule is in D2.

### Out of scope

- Any change to prompts or models. If the new photos fail, that is a
  finding for a follow-up, not a fix here.

## Decisions

**D1. Provisional labels count, marked.** Waiting for confirmation would
block the phase on Marina's time. The report keeps the two populations
apart so a disagreement is visible and fixable.

**D1a. Sourced photos stand in for bookstore photos.** Marina cannot take
them. Openly licensed shelf photos give the variety (stock, light, angle,
language) at the cost of a different camera and framing than a phone at
arm's length; the degraded set covers the phone-conditions half. Real
phone scans after 010 replace both over time.

**D2. The lookup rule.** If the primary reading model produced zero
invented titles over at least 30 sourced and degraded photos, 007 builds
enrichment only (author, cover, year for the picks) and verification is
dropped from requirement L1. If invented is above zero, 007 builds
verification, and the measured invented rate is the number it has to
bring to zero.

**D3. The baseline moves with the set.** `research/baseline.json` gets the
full-set numbers; `check` compares like with like by set name.

## How we know it worked

| Question | Pass |
|---|---|
| Set is real | At least 30 sourced photos with licence recorded, plus the degraded set, labelled and synced |
| Eval runs itself | Nightly job green two nights running, under the cap |
| Reading holds | Median recall at least 0.90 on the new photos; invented rate reported |
| Lookup decided | D2's rule applied and written in results.md with the counts |
