# 006 — Test set: sourced shelf photos, nightly eval, the lookup decision

Status: approved 2026-09-02
Date: 2026-09-02
Deadline: 2026-09-16 (the roadmap's date; 2026-09-23 was written here first)
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

**D2. The lookup rule.** (Applied on 2026-09-03 with the fallback
reading model's numbers, the primary having no key; the derived set showed
invention is a property of hard input, not of one model, so the decision
stands for the primary too. See results.md.) If the primary reading model
produced zero invented titles over at least 30 sourced and degraded
photos, 007 builds
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

## Decided during the work

Task 1 (sourcing and the degraded set), 2026-09-02:

- **Openverse only yields full-resolution files for its Wikimedia Commons
  provider.** Its `url` for Flickr, rawpixel and StockSnap items is a 1024
  or 960 px derivative and larger sizes are not reachable without an account,
  so those fail the 1200 px floor and were dropped (23 of 40 full-view
  rejections). Every sourced photo is therefore a Wikimedia Commons file,
  found either through Openverse (`ov_` stems, `source.url` on
  upload.wikimedia.org) or through the Commons API directly (`wm_` stems).
  Anonymous Openverse is capped at 20 results a page and 200 requests a day.
- **Faces printed on book covers do not count as faces.** The face rule
  protects people present in the photo; a cover portrait is published
  material. Photos with a bystander's face were rejected; one photo keeps a
  person turned away (`wm_richard_booth_s_bookshop_16`).
- **Legibility is judged at 1600 px on the long edge**, close to the 1568 px
  the reading models receive, not at the file's full resolution. Wide
  library-aisle shots that are legible only at 4000+ px were rejected.
- **Derived photos are rebuildable.** `photos fetch` regenerates every
  `derived` photo from its local original with the recorded `degradation`,
  so the degraded set needs no download and no storage beyond the label
  file. Parameters: blur radius 4 px, glare alpha 0.85 from the top-right
  corner, rotate 7 degrees counter-clockwise with black fill, small 1024 px.
  Derived labels carry `provisional: false` because they copy confirmed
  labels; the notes say what was done and repeat the original's notes.
- **Label `source` holds exactly the five contract keys.** The Commons file
  page and the pixel size go in `data/labels/SOURCES.md`, which is the
  attribution record.
- **`sync_photos` is overridden, not edited.** The 006 block at the end of
  `storage.py` rebinds `sync_photos` and extends `PHOTO_COLUMNS`; the lead
  can fold it into the original when merging. The migration adds a check
  constraint on `set`.
