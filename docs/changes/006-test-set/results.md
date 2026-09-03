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

1. Sourced labels (four workers), then the sourced set on the reading
   primary and fallback.
2. Baseline entries for `sourced` and `derived` once the primary has run.
3. The nightly job's first two green nights.
4. The lookup decision, written here with the counts.
