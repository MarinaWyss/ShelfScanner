# 014 — The v1 look and flow, copied

Status: asked for and built 2026-09-03 (Marina: "copy the current UI much more
closely ... same sections on the homepage, with the same text ... preferences
first with goodreads export instructions, then uploading the photo, then
recommendations"; "it should look reasonable on desktop"; "just looking at
the original code would be better": github.com/MarinaWyss/ShelfScanner-v1)
Date: 2026-09-03
Spend cap: $0
Track: app

## Why

012 gave this codebase a homepage and the original's preferences in this
codebase's own look. Marina wants the original's look and flow, not a
paraphrase of them: the earlier ShelfScanner is what the video's viewers
already know, and the new app should read as the same product with a new
engine.

## What changes

Copied from `ShelfScanner-v1/client/src` (`pages/home.tsx`, `pages/books.tsx`,
`components/book-scanner/*`, `pages/saved-books.tsx`,
`components/layout/Navbar.tsx`, `index.css`), as server-rendered templates
with the same words, layout and Tailwind colours, no framework:

- **Layout.** A sticky top bar with a menu button, the book mark and
  "ShelfScanner", and a Contact mail link on the right; a slide-in drawer
  with Home, Book Scanner and Reading List; content in a 72 rem column
  with the same paddings; white with gray text and violet buttons, black
  with gray cards in the dark.
- **Homepage** (`/`): the hero ("AI bookshelf scanner and book
  recommender", "Find the perfect book for you.", Start Scanning), the
  "AI Book Discovery" card, "How It Works" as three cards with amber
  numbers, "Start Using ShelfScanner Today" with Get Started Now, and the
  copyright footer.
- **Book Scanner** (`/books`): the v1 three-step page. Step 1 is the
  preferences: the eighteen genre buttons, "Add favorite authors
  (optional)" with an Add button and chips, the Goodreads card with the
  download link and the desktop note, Continue. Step 2 (`/books/upload`)
  is the dashed upload box with Choose Image, the tip, Get Recommendations
  and Back to Preferences. Step 3 replaces step 2 in place: the spinner
  with "Analyzing your books / This may take a moment..." over this app's
  stage list, then "Book Matches Based on Your Preferences", "Recommended
  for You" and the cards (cover from Open Library when the catalogue check
  found one, title, author, "Why This Matches You:", Save for Later /
  Saved to List, Not for me), "Detected Books (N)" folded, Scan More
  Books. The stepper's circles and line follow the step.
- **Reading List** (`/reading-list`): the heading with Scan More Books,
  the empty state, and cards with cover, title, author, "Date added",
  the reason and Remove.
- `/scan` and `/saved` redirect (301) to the new addresses;
  `/preferences` stays as the form's action and still renders step 1.
- Every "favourite" is "favorite".

### Not copied

Donate, the contact form, the dark-mode toggle (the app follows the
system), Privacy Policy and Terms & Conditions (013), Buy on Amazon and
the affiliate disclosure (013 decides), the "Books You've Already Read"
section and match-score badges (this app's chooser is told to prefer
unread books and gives no score), the in-page camera (the file input
opens the camera on a phone), the free-text preference field (v1 had
none; the object keeps the key for the CLI).

## Decisions

**D1. Same words, same shapes, no framework.** The Tailwind classes were
read off v1's components and written as plain CSS on the same custom
properties, so the page weighs what it did and needs no build step.

**D2. Authors as v1 does them**: a box, an Add button, chips with ×. The
chip list travels as the hidden `authors` field; what is still typed when
Continue is pressed travels as `authors_extra` and counts too, so nothing
typed is lost and the form works without the script.

**D3. Continue is never disabled.** v1 disabled it until a genre was
chosen; here a scan with no preferences still runs (005 D2), so the button
stays live and an empty object is stored.

**D4. The result takes the upload step's place**, as v1's step 3 does;
Scan More Books goes back to step 2, a refusal (a bad upload, a limit)
puts the form back so another photo can be chosen.

## How we know it worked

| Question | Pass | Result |
|---|---|---|
| The pages match v1 | side-by-side screenshots at 390 and 1280 px | done; the same sections, words and colours |
| The flow | preferences → upload → recommendations in the browser suite | `test_preferences_scan_save_unsave_mark_and_the_saved_list`, `test_continue_with_nothing_chosen_still_gets_five_picks` |
| Old addresses | `/scan`, `/saved`, `/preferences` still resolve | tests in `test_web_scan.py`, `test_web_picks.py`, `test_web_prefs.py` |
| Nothing else moved | `uv run pytest`, Playwright | 395 passed |
