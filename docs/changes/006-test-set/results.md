# 006 — Results (in progress)

Date: 2026-09-03. Sourced photos: 39 from Wikimedia Commons (CC0, CC BY,
public domain; attribution in `data/labels/SOURCES.md`). Derived photos:
20, four degradations of each core photo. Labels for the sourced set are
being drafted (provisional); the derived set carries the core labels.

## Derived set, Sonnet 5 direct, 1568 px, `extract_v1`

Run before the sourced labels existed, because the derived labels are
already confirmed. 20 photos, 20 ok, $0.18 total.

| Degradation | Photos | Median recall | Invented / photo | p50 latency | Cost / photo |
|---|---|---|---|---|---|
| glare (white gradient, alpha 0.85) | 5 | 0.93 | 0.0 | 5.0 s | $0.0096 |
| rotate (7°, canvas expanded) | 5 | 0.93 | 0.0 | 4.9 s | $0.0112 |
| blur (gaussian radius 4) | 5 | 0.83 | 0.2 | 4.3 s | $0.0082 |
| small (1024 px long edge) | 5 | 0.83 | 0.4 | 4.4 s | $0.0063 |
| core, undegraded (change 002) | 5 | 1.00 | 0.0 | 5.0 s | $0.0090 |

Findings:

- **Sharpness is the lever, not framing.** Glare and rotation cost two or
  three titles across five shelves and invented nothing. Blur and a
  smaller image cost the same recall and produced the first invented
  titles this model has given on any photo.
- **The inventions are merges of neighbouring spines**, not fabrications:
  "The Book of This and That You Lose the Time" is "The Book of Five
  Rings" run into "This Is How You Lose the Time War"; "The New Midlife"
  is a misread of "The New Middle East". One ("The Wisdom of the
  Bullfrog") is a real book that is not on the shelf.
- **Consequence for 003:** keep the phone-side resize at 1568 px; the
  1024 px row shows what a smaller upload would cost. A blurry photo is
  the failure to expect at a real shelf, and it is the one the lookup
  step (007) can catch: none of the three invented strings would resolve
  to a catalogue record.
- **Consequence for the lookup decision (D2):** the rule counts invented
  titles over sourced and derived photos; the derived set alone already
  puts the count above zero for the fallback reading model. The primary
  (Gemini 3.8 Flash) is still to be run once its key exists.

## Sourced set, Sonnet 5 direct, 1568 px, `extract_v1`

39 photos, all completed, $0.43. Labels: 1,677 titles and 140 partials,
drafted by the same model and verified by agents against the images
(provisional, per D1). Two photos are labelled only in part and sit out
of the invented count.

| | Sourced, 1568 px | Sourced, 2400 px | Core (change 002) |
|---|---|---|---|
| Photos | 39 | 39 | 5 |
| Labelled titles per photo, median | 43 | 43 | 12 |
| Median recall | 0.46 | 0.56 | 1.00 |
| Titles found / labelled | 651 / 1,677 | 852 / 1,677 | 67 / 69 |
| Flagged as invented, per complete photo | 3.9 | 4.9 | 0.0 |
| p50 latency | 5.3 s | 7.5 s | 5.0 s |
| Cost / photo | $0.011 | $0.017 | $0.009 |

**Recall is a resolution story, not a reading story.** The sourced photos
are bookshop walls and library bays at 2,000 to 6,000 px with a median of
43 labelled spines; at a 1,568 px long edge most spines are a few pixels
tall. The core photos are a phone at one shelf, which is the product's
case. The worst rows are the widest shots (a 500-book Japanese wall at
recall 0.02, a whole German living room at 0.06). At 2400 px the model
finds a third more titles (852 against 651) for 40 % more latency and
60 % more cost, and flags more near misses because it reads more tiny
spines. Resolution is part of the gap, not all of it: a wall of 100
spines is a different task from a shelf of 15, and the app's answer is
the phone-side crop the user makes by pointing at one shelf, not a
bigger upload. 1568 px stays the default (001 D7); the sourced set is a
stress test, and its pass line (median recall at least 0.90) is not met
by any setting tried.

**The invented count is mostly not invention.** Sorting the 149 flagged
strings over 38 complete photos:

| Bucket | Count | What it is |
|---|---|---|
| Fragment or volume of a labelled title | 36 | "AKIRA 2" against the label "AKIRA"; "Spiggy Holes" for "The Secret of Spiggy Holes" |
| Near miss, similarity 0.60 to 0.85 | 41 | misspellings and dropped subtitles on tiny spines |
| Author name in the title field | about 10 | "Tom Clancy", "Katherine Mansfield", "C.K. Stead" where the title was unreadable |
| Non-book items read as books | a few | "Scrabble", "Torres", a magazine cover line |
| Plausible title that is not on the shelf | the rest, on the order of 30 | "Rocket Surgery Made Easy" on a web-design shelf, "How to Win Friends and Influence People" on a philosophy shelf, "The End of History and the Last Man" |

The last bucket is the hallucination the scoping doc worries about: the
model fills an unreadable spine with a title that fits the shelf's genre.
It appears under exactly the conditions the derived set predicted, dense
and small, and never on the core photos.

## The lookup decision (D2)

**Verification.** The rule asked for zero invented titles over at least
30 sourced and derived photos; the count is well above zero on both sets
for the fallback reading model, and the derived set showed the mechanism
(merged and filled-in spines under blur or small images) is a property
of hard input, not of one model. The primary (Gemini 3.8 Flash) has not
run for want of a key; it can only confirm, since the same input
conditions apply to it. So 007 builds the lookup between extraction and
recommendation, drops titles with no catalogue record, and reports the
drop rate. Two consequences for 007's design, from the buckets above:

- A catalogue lookup catches "Rocket Surgery Made Easy" only if the
  lookup checks the shelf, not the world: that book exists. So
  verification cannot be "does this title exist"; the useful check is
  whether the record's title matches what was read closely enough, and
  the reason-giving step must be told which titles were unverified.
  Requirement L1 in the scoping doc is refined accordingly.
- Author-only strings and fragments should be resolved, not dropped: a
  lookup by author on a shelf where the title was unreadable is a cheap
  win, and a fragment that resolves to one record is a title found.

## Labelling notes to honour when scoring

- `wm_jp_japan_okinawa_naha` is labelled only in part (face-out covers and
  two bays; about 200 more spines are readable). It is excluded from the
  invented-title count for the lookup decision; a model's extra titles
  there are not inventions.
- `wm_bookshelf_unsplash` (a 500-book Japanese library wall) is labelled in
  three of twelve bays and is likewise excluded from the invented count.
- `wm_bookstore_shelf` carries six titles that are cover images printed on
  the section signs, not books on the shelf. Kept as labels: a model
  reporting them is reading, not inventing.
- Manga series with numbered volumes (`wm_009_anime_books`) are labelled
  once by series title; the matcher accepts "One Piece 67" against "One
  Piece".

## Still to do

1. The sourced set on the reading primary once `GEMINI_API_KEY` exists.
2. Baseline entries for `sourced` and `derived` once the primary has run.
3. The nightly job's first two green nights (needs the GitHub secrets).
