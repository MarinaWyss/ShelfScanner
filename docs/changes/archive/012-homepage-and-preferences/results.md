# 012 — Results

Built and closed 2026-09-03. Spend: $0.10 (six prompt runs over the core
set).

| Question | Pass | Result |
|---|---|---|
| Homepage | `/` renders the line, the three steps, the kept-or-not list and the button; no session row, no cookie | yes (`test_the_homepage_makes_no_session_and_sets_no_cookie`, `test_homepage_explains_and_leads_to_the_scan_page`) |
| Scan moved | `/scan` is the old page; first visit redirects to `/preferences` | yes (the sessions, scan and e2e suites, moved) |
| iOS button | a click with no file shows the message and opens the picker; `POST /scan` with no file is 400 | yes in Chromium (`test_a_click_with_no_photo_says_so_and_sends_nothing`, `test_a_submit_with_no_photo_is_refused_with_the_message_not_a_422`); Marina's iPhone pending |
| Genres | eighteen chips; an off-list stored genre stays checked | yes (`test_first_visit_shows_the_page_with_a_skip_and_the_originals_eighteen_genres`, `test_a_stored_genre_off_the_list_stays_chosen_with_its_own_chip`) |
| Authors | round-trip to `authors`; the prompt text carries `Favorite authors: …` | yes (`test_favorite_authors_round_trip_as_a_list`, the e2e feedback flow reads it in the model input) |
| Prompt | on-list 1.00, median overlap within 0.5 of v3 | v5 yes; v4 no (below) |
| Favicon | the SVG and the PNG are 200 | yes (e2e); tab screenshot for the video is Marina's |
| Nothing else moved | pytest, Playwright, `research.check` | 395 passed; check PASS |

## The prompt comparison

GPT-5.4 mini, core set, the eval preferences (flat, no export). v3's
thirty runs never put a pick off the shelf. v4 added one bullet: a shelf
book by a favorite author is a strong pick, "and so is a book that
resembles their work". Two of its fifteen runs put a pick off the shelf,
both on photo 1: one an invented title ("How to Know a Person"), one a
mangled one ("How to Lose the Time War", 0.81 against the shelf's title,
under the 0.85 match line). The clause about resembling work is the likely
nudge. v5 is the same bullet without that clause.

| prompt | runs | off-shelf picks | on-list | overlap mean (p1 to p4) | median |
|---|---|---|---|---|---|
| v3 | 30 | 0 | 1.00 | 3.00 | 2.5 |
| v4 | 15 | 2 | 0.973 | 3.00 | 3.0 |
| v5 | 15 | 0 | 1.00 | 3.00 | 3.0 |

v5 is the default (`recommend.DEFAULT_PROMPT`, `web/pipeline.CHOOSING_PROMPT`).
The third run of each version used the eval preferences plus two authors
(Neil Gaiman, Kim Stanley Robinson; `data/prefs/marina_authors.json`);
American Gods, on shelf 1, was picked in every run with or without them,
so the field's effect on the core set is not measurable yet. It will be
on real scans.

## Decided during the work

- Same day, after the runs: the homepage lost its "what is kept" section
  and took the original's "How It Works" wording verbatim (Upload Photo,
  Set Preferences, Find Matching Books), and every "favourite" became
  "favorite", including the label in the preferences text and the line in
  `recommend_v5.md`. The fifteen v5 runs above used the British spelling;
  the prompt is otherwise unchanged and keeps its version.

- The favorite-authors line reaches the model through the preferences
  text whatever the prompt version; the prompt version only explains it.
- The authors key is carried through the flat-shape upgrade too, so a
  hand-written preferences file can name them.
