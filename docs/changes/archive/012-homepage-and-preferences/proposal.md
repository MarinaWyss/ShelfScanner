# 012 — Homepage, the original's preferences, the scan button on iOS, a favicon

Status: approved 2026-09-03
Date: 2026-09-03
Deadline: before the design segment is recorded
Spend cap: $1 (one prompt comparison on the core set)
Track: app

## Why

The app is live (010) and every page on it is functional and bare: the
scan page is a heading, a file picker and a button. The earlier
ShelfScanner (shelfscanner.io, a different codebase) had a homepage that
told a visitor what the thing does before asking for a photo, a genre list
of eighteen, and a place to name favorite authors; this codebase has none
of those, and it is the one that will be shown. Two smaller things belong
in the same pass: on an iPhone, tapping "Read the shelf" with no photo
chosen does nothing at all (Safari enforces `required` silently, where
other browsers show "Please select a file"), and the tab has no icon.

## What is on the original, for the record

Read from its bundle on 2026-09-03. Headline "AI bookshelf scanner and
book recommender", "Find the perfect book for you.", the promise "Take a
photo of an entire bookshelf at stores, the library, or a friend's house,
and we'll help you figure out which ones you'll like!", three steps
(photograph a shelf and the books are identified; tell us your interests;
see which match your taste), and "Never miss a great book again". Genres:
Fiction, Non-Fiction, Business, Design, Self-Help, Science, Mystery,
Romance, Fantasy, Science Fiction, Biography, History, Young Adult,
Thriller, Horror, Poetry, Classics, Comics. "Add favorite authors
(optional)": a text field, an Add button, removable chips, stored as an
`authors` list. A Goodreads upload. Violet accent, Tailwind, a 📚 emoji
as the favicon. Also ads, a donation prompt, privacy and terms pages and
a contact form, none of which this change copies.

## What changes

- **A homepage at `/`.** What it does in one line, the three steps, what
  is and is not kept (no account; the photo is deleted after thirty days;
  a Goodreads export is read once and not stored), and one button, "Scan
  a shelf". The scan page moves to `/scan`; the first visit to it with no
  preferences still goes to the preferences page first, with "Skip for
  now". The homepage creates no session row: a crawler or a curious
  visitor should not become a `sessions` row until they scan.
- **The original's eighteen genres** replace the current twelve. A stored
  genre that is not on the list stays chosen and is shown as its own chip,
  so nobody's saved preferences lose anything.
- **Favorite authors.** One text field on the preferences page,
  "Favorite authors, separated by commas". Stored as a sixth key on the
  preferences object, `authors` (list of strings), laid out for the model
  as `Favorite authors: a, b`. The prompt gains one sentence about it and
  becomes `recommend_v4`; v3 and v4 are compared on the core set with
  `research.report --by-prompt` before v4 becomes the default, as 004 and
  011 did.
- **The scan button on iOS.** `required` comes off the input. A tap with
  no photo opens the picker and shows "Choose a photo first" under the
  button; a submit that reaches the server with no file is refused with
  400 and the same message, so the page says something even without
  JavaScript.
- **A favicon**: an SVG drawn in the app's own palette (a small stack of
  books), served from `/static/`, plus a 180 px PNG for an iPhone home
  screen. The homepage and the tab title use it.
- The nav gains a home link (the brand mark); "Scan" points at `/scan`.

### Out of scope

- A visual redesign. The homepage uses the palette and type the app
  already has (paper, ink, terracotta); no framework, no font download.
- An in-page camera view. The native file input with `capture` already
  opens the camera on a phone.
- A dark-mode toggle (the app follows the system), ads, donations,
  privacy and terms pages, a contact form, accounts.
- Author-aware lookup or matching. Authors go to the model as a
  preference; nothing else reads them.

## Decisions

**D1. The homepage is unsessioned.** It is the one page a stranger lands
on; a session row per visit would inflate the sessions table and the
dashboard's counts with people who never scanned. `/scan`, `/saved`,
`/preferences` keep their sessions.

**D2. Authors are a comma-separated field, not chips.** Chips need
JavaScript and an Add button; a text field works everywhere, on the
first try, and the object stores the same list either way. The page
shows the stored list back as the field's value.

**D3. A new prompt version for one sentence.** The rule since 004:
prompts are files named by version and a changed prompt is a new file,
compared before it is the default. The sentence: "Favorite authors" are
authors they love; a shelf book by one of them is a strong pick.

**D4. The genre names are the original's, verbatim,** so the video can
say the new app has the same list. "Non-Fiction" and "Self-Help" keep
their hyphens.

## How we know it worked

| Question | Pass |
|---|---|
| Homepage | `/` renders the line, the three steps, the kept-or-not list and the button; a `GET /` creates no `sessions` row and sets no cookie (test) |
| Scan moved | `/scan` is the old page; first visit with no preferences redirects to `/preferences` (existing test, moved) |
| iOS button | Playwright: a click with no file shows "Choose a photo first" and opens the picker; `POST /scan` with no file is 400 with the message (test); Marina's iPhone: the tap opens the picker |
| Genres | The eighteen chips render; a saved object with an off-list genre shows it checked (test) |
| Authors | The field round-trips to `authors` on the stored object (test); the prompt text contains `Favorite authors: …` (test) |
| Prompt | v4 on the core set with the eval preferences plus two authors: on-list share 1.00, median overlap within 0.5 of v3; the table in `results.md` |
| Favicon | `/static/favicon.svg` and the PNG are 200; a screenshot of the tab |
| Nothing else moved | `uv run pytest`, the Playwright suite, `research.check` PASS |
