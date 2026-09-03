"""Reading preferences: the object the recommendation prompt consumes (change 004).

Built from a Goodreads export (D1: ratings are the signal, shelves the filter; D2: a budget, not the
whole history) or upgraded from the flat hand-written shape of `data/prefs/marina.json`. Stored as a
JSON file or in the `preferences` table keyed by session. The raw CSV is never stored.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
from dataclasses import dataclass
from datetime import UTC, date, datetime
from pathlib import Path

MAX_RATED = 60  # D2
MAX_TO_READ = 20  # D2
KEYS = ("genres", "free_text", "rated_books", "to_read", "avoid")
PREFS_DIR = Path("data/prefs")

_REQUIRED_COLUMNS = ("Title", "Author", "My Rating", "Exclusive Shelf", "Date Read", "Date Added")
_DATE = re.compile(r"^(\d{4})/(\d{2})/(\d{2})$")


@dataclass(frozen=True)
class Row:
    """One line of the export, reduced to what the object needs."""

    title: str
    author: str
    rating: int  # 0 = unrated
    shelf: str  # the exclusive shelf: read, to-read, currently-reading, did-not-finish
    date_read: date | None
    date_added: date | None

    @property
    def when(self) -> date:
        """Recency for ordering: when it was read, else when it was added, else the epoch."""
        return self.date_read or self.date_added or date.min


# --- the object -------------------------------------------------------------------------------------


def empty() -> dict:
    return {"genres": [], "free_text": "", "rated_books": [], "to_read": [], "avoid": []}


def is_v2(prefs: dict) -> bool:
    """The structured shape has at least one of the keys the flat shape never had."""
    return any(k in prefs for k in ("rated_books", "to_read", "free_text"))


def upgrade(prefs: dict) -> dict:
    """Convert the flat shape (`genres`, `likes`, `loved_books`, `avoid`) to the structured one.

    A structured object passes through with missing keys filled in. `likes` becomes `free_text`;
    each `loved_books` title becomes a rated book at 5 with no author. A top-level `_note` is dropped.
    """
    out = empty()
    if is_v2(prefs):
        out.update({k: prefs[k] for k in KEYS if k in prefs})
        return out
    out["genres"] = [str(g) for g in prefs.get("genres", [])]
    out["free_text"] = str(prefs.get("likes", "") or "")
    out["rated_books"] = [{"title": str(t), "author": None, "rating": 5} for t in prefs.get("loved_books", [])]
    out["avoid"] = [str(a) for a in prefs.get("avoid", [])]
    return out


def cap(prefs: dict, max_rated: int = MAX_RATED, max_to_read: int = MAX_TO_READ) -> dict:
    """D2. Keep at most `max_rated` rated books and `max_to_read` to-read titles.

    Lists are taken in the order given (the importer orders them by rating and recency first), except
    that dislikes (rated 1 or 2) are kept ahead of everything else: they are rare and they are the
    avoid signal. The surviving rated books keep their relative order.
    """
    rated = prefs.get("rated_books", [])
    dislikes = [b for b in rated if b.get("rating", 0) <= 2]
    others = [b for b in rated if b.get("rating", 0) > 2]
    kept = set(map(id, (dislikes + others)[:max_rated]))
    out = dict(prefs)
    out["rated_books"] = [b for b in rated if id(b) in kept]
    out["to_read"] = list(prefs.get("to_read", []))[:max_to_read]
    return out


def as_text(prefs: dict) -> str:
    """The structured object laid out for the prompt: rated books compactly, to-read as a list.

    Sections that are empty are omitted.
    """
    parts: list[str] = []
    if prefs.get("genres"):
        parts.append("Genres: " + ", ".join(prefs["genres"]))
    if prefs.get("free_text"):
        parts.append("About the reader: " + prefs["free_text"].strip())
    if prefs.get("rated_books"):
        parts.append("Rated books, 1 (disliked) to 5 (loved):")
        parts += [f"- {_book_line(b)} ({b['rating']}/5)" for b in prefs["rated_books"]]
    if prefs.get("to_read"):
        parts.append("Wants to read:")
        parts += [f"- {_book_line(b)}" for b in prefs["to_read"]]
    if prefs.get("avoid"):
        parts.append("Avoid:")
        parts += [f"- {a}" for a in prefs["avoid"]]
    return "\n".join(parts) if parts else "(no preferences given)"


def _book_line(book: dict) -> str:
    author = book.get("author")
    return f"{book['title']} — {author}" if author else book["title"]


# --- the importer -----------------------------------------------------------------------------------


def read_export(path: Path) -> list[Row]:
    """Parse a Goodreads library export. Only the columns the object needs are read."""
    with path.open(newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        missing = [c for c in _REQUIRED_COLUMNS if c not in (reader.fieldnames or [])]
        if missing:
            raise SystemExit(f"{path} is not a Goodreads export: missing columns {', '.join(missing)}")
        rows = []
        for rec in reader:
            title = _clean(rec["Title"])
            if not title:
                continue
            rows.append(Row(title, _clean(rec["Author"]), _rating(rec["My Rating"]), _clean(rec["Exclusive Shelf"]),
                            _date(rec["Date Read"]), _date(rec["Date Added"])))
    return rows


def build(rows: list[Row], *, genres: list[str] | None = None, free_text: str = "", avoid: list[str] | None = None,
          max_rated: int = MAX_RATED, max_to_read: int = MAX_TO_READ) -> dict:
    """The preferences object from export rows plus whatever the user said in words (D1, D2).

    - `read` with a rating 1 to 5 -> `rated_books`; unrated read books carry no signal and are dropped.
    - `to-read` -> `to_read`, most recently added first.
    - `did-not-finish` -> an `avoid` entry, whatever its rating.
    - `currently-reading` is dropped: the reader already has it in hand.
    """
    rated_rows = [r for r in rows if r.shelf == "read" and 1 <= r.rating <= 5]
    # Selection order for the cap: dislikes first, then the strongest likes, most recent first within a rating.
    rated_rows.sort(key=lambda r: (0 if r.rating <= 2 else 1, -abs(r.rating - 3), r.when.toordinal() * -1, r.title))
    prefs = empty()
    prefs["genres"] = list(genres or [])
    prefs["free_text"] = free_text
    prefs["rated_books"] = [{"title": r.title, "author": r.author or None, "rating": r.rating} for r in rated_rows]
    to_read = sorted((r for r in rows if r.shelf == "to-read"), key=lambda r: (r.date_added or date.min).toordinal() * -1)
    prefs["to_read"] = [{"title": r.title, "author": r.author or None} for r in to_read]
    prefs["avoid"] = list(avoid or []) + [f"{_book_line({'title': r.title, 'author': r.author})} (did not finish)"
                                          for r in rows if r.shelf == "did-not-finish"]
    prefs = cap(prefs, max_rated, max_to_read)
    # Presentation order: highest rating first, most recent first within a rating.
    when = {(r.title, r.author): r.when for r in rated_rows}
    prefs["rated_books"].sort(key=lambda b: (-b["rating"], when[(b["title"], b["author"] or "")].toordinal() * -1))
    return prefs


def import_export(path: Path, *, base: dict | None = None, genres: list[str] | None = None, free_text: str | None = None,
                  avoid: list[str] | None = None, max_rated: int = MAX_RATED, max_to_read: int = MAX_TO_READ) -> dict:
    """Read an export and build the object. `base` (an existing file, either shape) supplies genres, free
    text and avoid entries; the explicit arguments extend or replace them."""
    b = upgrade(base) if base else empty()
    return build(read_export(path), genres=(b["genres"] + list(genres or [])) or None,
                 free_text=free_text if free_text is not None else b["free_text"],
                 avoid=b["avoid"] + list(avoid or []), max_rated=max_rated, max_to_read=max_to_read)


def _clean(s: str | None) -> str:
    return " ".join((s or "").split())


def _rating(s: str | None) -> int:
    """Goodreads writes `4.0` in recent exports and `4` in older ones; empty or 0 means unrated."""
    s = (s or "").strip()
    if not s:
        return 0
    try:
        r = int(float(s))
    except ValueError:
        return 0
    return r if 1 <= r <= 5 else 0


def _date(s: str | None) -> date | None:
    m = _DATE.match((s or "").strip())
    if not m:
        return None
    try:
        return date(int(m[1]), int(m[2]), int(m[3]))
    except ValueError:
        return None


# --- loading and storing ----------------------------------------------------------------------------


def load_file(path: Path) -> dict:
    prefs = json.loads(path.read_text())
    if not isinstance(prefs, dict):
        raise SystemExit(f"{path} does not hold a preferences object")
    prefs.pop("_note", None)
    return prefs


def load(ref: str | Path) -> dict:
    """A `--prefs` value: a JSON file path, or a session id (all digits) read from the `preferences` table.
    The object comes back in the shape it was stored; see recommend.prefs_text for how each shape is sent."""
    ref = str(ref)
    if ref.isdigit():
        return load_for_session(int(ref))
    return load_file(Path(ref))


def load_for_session(session_id: int) -> dict:
    from shelfscanner.db import get_client

    res = get_client().table("preferences").select("object").eq("session_id", session_id).execute()
    if not res.data:
        raise SystemExit(f"No preferences stored for session {session_id}")
    return res.data[0]["object"]


def save_for_session(session_id: int, prefs: dict) -> dict:
    """Upsert the object for a session; a re-import replaces the previous one."""
    from shelfscanner.db import get_client

    row = {"session_id": session_id, "object": prefs, "updated_at": datetime.now(UTC).isoformat()}
    return get_client().table("preferences").upsert(row, on_conflict="session_id").execute().data[0]


def counts(prefs: dict) -> str:
    return (f"{len(prefs['rated_books'])} rated books, {len(prefs['to_read'])} to read, "
            f"{len(prefs['avoid'])} avoid entries, {len(prefs['genres'])} genres")


# --- CLI --------------------------------------------------------------------------------------------


def add_parser(subparsers: argparse._SubParsersAction) -> None:
    """`shelfscanner prefs import`. Wired by cli.py with one line: `preferences.add_parser(sub)`."""
    prefs = subparsers.add_parser("prefs", help="build and store reading preferences")
    prefs_sub = prefs.add_subparsers(dest="prefs_command", required=True)
    imp = prefs_sub.add_parser("import", help="build a preferences object from a Goodreads export")
    imp.add_argument("--csv", required=True, type=Path, help="Goodreads library export (never stored)")
    imp.add_argument("--base", type=Path, default=None,
                     help="existing preferences JSON (either shape) whose genres, free text and avoid entries carry over")
    imp.add_argument("--genres", nargs="*", default=None, help="genres, added to any from --base")
    imp.add_argument("--free-text", default=None, help="what the reader likes, in their words; replaces --base's")
    imp.add_argument("--avoid", nargs="*", default=None, help="things to avoid, added to any from --base")
    imp.add_argument("--max-rated", type=int, default=MAX_RATED, help=f"cap on rated books (default {MAX_RATED}, D2)")
    imp.add_argument("--max-to-read", type=int, default=MAX_TO_READ, help=f"cap on to-read titles (default {MAX_TO_READ}, D2)")
    target = imp.add_mutually_exclusive_group()
    target.add_argument("--name", default=None, help=f"write to {PREFS_DIR}/<name>.json (default: goodreads)")
    target.add_argument("--out", type=Path, default=None, help="write to this path instead")
    target.add_argument("--session", type=int, default=None, help="write to the preferences table for this session id")
    imp.set_defaults(func=_import_command)


def _import_command(args: argparse.Namespace) -> None:
    base = load_file(args.base) if args.base else None
    prefs = import_export(args.csv, base=base, genres=args.genres, free_text=args.free_text, avoid=args.avoid,
                          max_rated=args.max_rated, max_to_read=args.max_to_read)
    if args.session is not None:
        save_for_session(args.session, prefs)
        print(f"session {args.session}: {counts(prefs)}")
        return
    out = args.out or PREFS_DIR / f"{args.name or 'goodreads'}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(prefs, indent=2, ensure_ascii=False) + "\n")
    print(f"{out}: {counts(prefs)}")
