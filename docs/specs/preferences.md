# Preferences

What the recommendation step knows about the reader: a preferences object,
built from a Goodreads export or written by hand, stored as a file or per
session.

## The object

JSON with five keys.

- `genres`: list of strings.
- `free_text`: what the reader likes, in their words.
- `rated_books`: list of `{title, author, rating}`, rating 1 to 5, highest
  rating first and most recently read first within a rating. `author` is
  null when unknown.
- `to_read`: list of `{title, author}`, most recently added first.
- `avoid`: list of strings: topics, styles, or specific books.

The older flat shape (`genres`, `likes`, `loved_books`, `avoid`, optional
`_note`) is still accepted everywhere a preferences file is. `upgrade()`
converts it: `likes` becomes `free_text`, each `loved_books` title becomes a
rated book at 5 with no author, `to_read` is empty, `_note` is dropped. An
object that already has any of `rated_books`, `to_read` or `free_text` is
treated as the new shape and missing keys are filled with empty values.

## Importing a Goodreads export

On the web page the export file is refused with 413 when it is over 4 MB
(the scan route's limit; an export is usually well under 1 MB).

`uv run shelfscanner prefs import --csv <export.csv> [--base <prefs.json>] [--genres g ...] [--free-text "..."] [--avoid a ...] [--max-rated N] [--max-to-read N] [--name n | --out path | --session id]`

Reads the CSV Goodreads produces under "Export library". Only `Title`,
`Author`, `My Rating`, `Exclusive Shelf`, `Date Read` and `Date Added` are
used; a file without those columns is refused. Whitespace runs in titles and
authors are collapsed; titles are otherwise verbatim, series suffixes
included. Ratings `4.0`, `4`, `0` and an empty cell all parse; 0 and empty
mean unrated.

Per row, by exclusive shelf:

- `read` with a rating 1 to 5 goes to `rated_books`. Unrated read books are
  dropped: they say nothing about taste.
- `to-read` goes to `to_read`.
- `did-not-finish` becomes an `avoid` entry, "Title — Author (did not
  finish)", whether or not it was rated.
- `currently-reading` is dropped: the reader already has it in hand.

The cap (`--max-rated`, default 60; `--max-to-read`, default 20) bounds the
prompt. Rated books are kept in this priority: books rated 1 or 2 first
(they are few and they are the avoid signal), then 5s, then 4s, then 3s,
most recently read first within a rating (date added stands in when the
read date is blank). To-read titles are kept most recently added first.
The surviving rated books are then ordered for presentation as above.

`--base` takes an existing preferences file of either shape and carries
over its `genres`, `free_text` and `avoid`; `--genres` and `--avoid` add
to those, `--free-text` replaces it. The base's `loved_books` or
`rated_books` do not carry over: the export is the history.

Output goes to `data/prefs/<name>.json` (`--name`, default `goodreads`),
to `--out`, or with `--session` to the `preferences` table. The command
prints the counts. The CSV is never stored or logged.

## Storage

Table `preferences`: `session_id` (primary key, references `sessions`,
deleted with it), `object` jsonb, `updated_at`. One row per session,
replaced on re-import. Only `service_role` can read or write it.

A `--prefs` argument that is all digits is a session id and reads from the
table; anything else is a file path.

## How the model sees it

The "Reading preferences" section of the recommendation input:

- A structured object is laid out as labelled lists, whatever the prompt:
  `Genres: a, b`, `About the reader: ...`, `Rated books, 1 (disliked) to 5
  (loved):` with one line per book as `Title — Author (5/5)`, `Wants to
  read:` and `Avoid:` as lists. Empty sections are omitted.
- The flat shape is sent as JSON, exactly as before, when the prompt is
  `recommend_v1`. For any other prompt it is upgraded first and laid out as
  above.

`prompts/recommend_v2.md` explains those sections to the model: high
ratings are what to match, low ratings what to steer away from, a to-read
title on the shelf is a very strong pick, and the avoid list is binding. It
keeps v1's hard rules and reply shape. `recommend_v3.md`, the default, is
v2 with the shelf list moved after the preferences and the shelf-only rule
restated at the start and the end (`recommendation.md`). The `preferences` column of the
recommendation row logs the object as given to the command, not the
laid-out text.
