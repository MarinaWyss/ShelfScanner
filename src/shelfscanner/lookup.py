"""Book lookup against Open Library's search API (change 007, D1, D2).

One catalogue query per title, the existing fuzzy title matcher over the
candidates it returns, and a bounded thread pool for a whole shelf. A
catalogue failure of any kind is a miss, never an exception: the scan goes
on without the record (D2).

The only network code is `_search`; everything else is pure so the tests run
against recorded responses in `tests/fixtures/openlibrary_*.json`.
"""

from __future__ import annotations

import logging
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta  # change 008
from difflib import SequenceMatcher
from functools import lru_cache
from typing import Any, Protocol

import httpx

from shelfscanner.config import load_config
from shelfscanner.matching import normalise, similarity

log = logging.getLogger(__name__)

CATALOGUE = "openlibrary"
SEARCH_URL = "https://openlibrary.org/search.json"
# Open Library asks API clients to identify themselves. No contact address is
# sent; the repository is the point of contact.
USER_AGENT = "ShelfScanner/0.1 (+https://github.com/marinawyss/ShelfScanner)"
FIELDS = "key,title,author_name,first_publish_year,cover_i"
LIMIT = 5
AUTHOR_BONUS = 0.10  # added to the title similarity when the catalogue author matches the one read
_AUTHOR_THRESHOLD = 0.8  # sequence ratio on normalised author names, or a shared surname
_MAX_AUTHORS = 3  # anthologies list dozens; the record keeps the first few


@dataclass(frozen=True)
class BookRecord:
    catalogue: str
    catalogue_id: str  # Open Library work id, e.g. "OL27448W"
    title: str
    author: str | None  # up to three names, comma separated
    first_year: int | None
    cover_id: str | None  # Open Library cover id; https://covers.openlibrary.org/b/id/<id>-M.jpg


@dataclass(frozen=True)
class Match:
    record: BookRecord
    score: float


@dataclass(frozen=True)
class Batch:
    """One shelf's worth of lookups, with the counts the `lookups` row records."""

    matches: list[Match | None]
    hits: int
    misses: int  # includes errors
    errors: int  # transport failure, timeout, non-200 or unparseable reply
    latency_ms: int
    # --- change 007 (task 3) --- per-item detail, so verification can keep a title whose lookup
    # failed (unverified, D2) while dropping one the catalogue answered for, and name the nearest
    # candidate under the threshold in the drop log. Same order as `matches`.
    item_errors: list[str | None] = field(default_factory=list)
    nearest: list[tuple[str, float] | None] = field(default_factory=list)
    # --- change 008 --- titles answered from the cache (a record or a fresh miss) without a catalogue call
    cache_hits: int = 0


class Transport(Protocol):
    """The slice of `httpx.Client` the module uses; tests pass a stub."""

    def get(self, url: str, *, params: dict[str, Any], headers: dict[str, str], timeout: float) -> httpx.Response: ...


@lru_cache(maxsize=1)
def _default_client() -> httpx.Client:
    return httpx.Client(follow_redirects=True)


def query_params(title: str, author: str | None) -> dict[str, Any]:
    """The exact query sent for a title; the fixture recorder uses it too."""
    params: dict[str, Any] = {"title": title.strip(), "fields": FIELDS, "limit": LIMIT}
    if author and author.strip():
        params["author"] = author.strip()
    return params


def lookup(title: str, author: str | None, *, client: Transport | None = None, timeout_s: float = 4.0) -> Match | None:
    """The best catalogue record for a title read off a shelf, or None.

    None means no candidate reached the config's `match_threshold`, or the
    catalogue could not be reached; the latter is logged, never raised.
    """
    match, _ = _attempt(title, author, client=client, timeout_s=timeout_s)
    return match


def lookup_batch(items: list[tuple[str, str | None]], *, concurrency: int = 6,
                 client: Transport | None = None, timeout_s: float = 4.0,
                 cache: CacheStore | None = None) -> Batch:
    """Look up every (title, author) pair with at most `concurrency` requests in flight.

    With a `cache` (change 008), pairs the cache answers are not sent to the catalogue: a
    cached record is resolved from `books`, a miss younger than `MISS_TTL` stays a miss.
    Everything else is queried as before and the answers are written back. No cache means
    the module behaves as it did in 007.
    """
    started = time.perf_counter()
    if not items:
        return Batch([], 0, 0, 0, 0)
    # --- change 008 --- the cache first; only the pairs it cannot answer reach the catalogue
    cached = consult_cache(items, cache)  # None when the store is unavailable: cold, and nothing written back
    attempts: list[Attempt | None] = list(cached) if cached is not None else [None] * len(items)
    todo = [i for i, a in enumerate(attempts) if a is None]
    if todo:
        with ThreadPoolExecutor(max_workers=max(1, concurrency)) as pool:
            fresh = list(pool.map(lambda i: _attempt_detail(items[i][0], items[i][1], client=client, timeout_s=timeout_s), todo))
        for i, a in zip(todo, fresh, strict=True):
            attempts[i] = a
        if cached is not None:
            remember(items, todo, attempts, cache)
    cache_hits = len(items) - len(todo)
    # --- end change 008 ---
    matches = [a.match for a in attempts]
    hits = sum(m is not None for m in matches)
    errors = sum(a.error is not None for a in attempts)
    return Batch(matches, hits, len(items) - hits, errors, int((time.perf_counter() - started) * 1000),
                 item_errors=[a.error for a in attempts], nearest=[a.nearest for a in attempts],  # change 007 (task 3)
                 cache_hits=cache_hits)  # change 008


def lookup_many(items: list[tuple[str, str | None]], *, concurrency: int = 6,
                client: Transport | None = None, timeout_s: float = 4.0) -> list[Match | None]:
    """`lookup` over a list, in the same order, with bounded concurrency."""
    return lookup_batch(items, concurrency=concurrency, client=client, timeout_s=timeout_s).matches


# ---------------------------------------------------------------------------
# One attempt: the queries in `query_variants`, in order, until one finds a
# record. Every candidate is scored against the title and author as read.
# ---------------------------------------------------------------------------


def query_variants(title: str, author: str | None) -> list[tuple[str, str | None]]:
    """Queries to try, most specific first. Open Library's title search wants
    every word in the record's title, so a subtitle the catalogue does not
    carry hides the book; and a wrongly read author hides it too. So: the
    title as read with the author, the part before a colon with the author,
    then both without the author. Duplicates are dropped."""
    title = title.strip()
    main = title.split(":", 1)[0].strip() or title
    author = author.strip() if author and author.strip() else None
    candidates = [(title, author), (main, author), (title, None), (main, None)]
    out: list[tuple[str, str | None]] = []
    for q in candidates:
        if q not in out:
            out.append(q)
    return out


def _attempt(title: str, author: str | None, *, client: Transport | None,
             timeout_s: float) -> tuple[Match | None, str | None]:
    """Returns (match, error). error is set only when the catalogue failed."""
    a = _attempt_detail(title, author, client=client, timeout_s=timeout_s)
    return a.match, a.error


# --- change 007 (task 3) --- the attempt with what verification needs beyond the match.
@dataclass(frozen=True)
class Attempt:
    match: Match | None
    error: str | None  # set only when the catalogue failed
    nearest: tuple[str, float] | None  # best candidate under the threshold (catalogue title, score); None on a hit


def _attempt_detail(title: str, author: str | None, *, client: Transport | None, timeout_s: float) -> Attempt:
    if not title or not title.strip():
        return Attempt(None, None, None)
    threshold = load_config().match_threshold
    nearest: tuple[str, float] | None = None
    for q_title, q_author in query_variants(title, author):
        docs, error = _search(q_title, q_author, client=client, timeout_s=timeout_s)
        if error is not None:
            return Attempt(None, error, nearest)
        match = best_match(title, author, docs, threshold)
        if match is not None:
            return Attempt(match, None, None)
        for doc in docs:
            record = to_record(doc)
            if record is not None:
                s = score(title, author, doc)
                if nearest is None or s > nearest[1]:
                    nearest = (record.title, s)
    return Attempt(None, None, nearest)


def _search(title: str, author: str | None, *, client: Transport | None,
            timeout_s: float) -> tuple[list[dict[str, Any]], str | None]:
    """Returns (docs, error). Any failure is an error string, never an exception (D2)."""
    c = client or _default_client()
    try:
        r = c.get(SEARCH_URL, params=query_params(title, author), headers={"User-Agent": USER_AGENT}, timeout=timeout_s)
        if r.status_code != 200:
            error = f"http {r.status_code}"
        else:
            body = r.json()
            docs = body.get("docs") if isinstance(body, dict) else None
            if not isinstance(docs, list):
                error = "malformed reply"
            else:
                return docs, None
    except (httpx.HTTPError, ValueError) as e:  # transport, timeout, or a reply that is not JSON (D2)
        error = f"{type(e).__name__}: {e}" if str(e) else type(e).__name__
    log.warning("openlibrary lookup failed for %r: %s", title, error)
    return [], error


# ---------------------------------------------------------------------------
# Pure scoring over the returned docs.
# ---------------------------------------------------------------------------


def best_match(title: str, author: str | None, docs: list[dict[str, Any]], threshold: float) -> Match | None:
    """Highest-scoring doc at or above the threshold, first one on a tie (the catalogue's relevance order)."""
    best: Match | None = None
    for doc in docs:
        record = to_record(doc)
        if record is None:
            continue
        s = score(title, author, doc)
        if s >= threshold and (best is None or s > best.score):
            best = Match(record, s)
    return best


def score(title: str, author: str | None, doc: dict[str, Any]) -> float:
    """Title similarity (extracted title against the catalogue title) plus a bonus for a matching author, capped at 1."""
    doc_title = doc.get("title")
    if not isinstance(doc_title, str) or not doc_title.strip():
        return 0.0
    s = similarity(title, doc_title)
    if author and author.strip() and author_matches(author, doc.get("author_name") or []):
        s = min(1.0, s + AUTHOR_BONUS)
    return s


def author_matches(author: str, names: list[str]) -> bool:
    """A close name, or a shared surname: shelves show 'Gaiman', the catalogue says 'Neil Gaiman'."""
    a = normalise(author)
    if not a:
        return False
    a_last = a.split()[-1]
    for name in names:
        n = normalise(name)
        if not n:
            continue
        if SequenceMatcher(None, a, n).ratio() >= _AUTHOR_THRESHOLD:
            return True
        if len(a_last) >= 3 and a_last == n.split()[-1]:
            return True
    return False


def to_record(doc: dict[str, Any]) -> BookRecord | None:
    """A BookRecord from a search doc, or None when the doc lacks a work key or title."""
    key, title = doc.get("key"), doc.get("title")
    if not isinstance(key, str) or not isinstance(title, str) or not title.strip():
        return None
    names = [n for n in doc.get("author_name") or [] if isinstance(n, str) and n.strip()]
    year = doc.get("first_publish_year")
    cover = doc.get("cover_i")
    return BookRecord(
        catalogue=CATALOGUE,
        catalogue_id=key.rsplit("/", 1)[-1],
        title=title.strip(),
        author=", ".join(names[:_MAX_AUTHORS]) or None,
        first_year=year if isinstance(year, int) else None,
        cover_id=_digits(cover),
    )


def _digits(cover: Any) -> str | None:
    """A cover id is a non-negative integer, as a string (017): anything else is no cover."""
    if isinstance(cover, bool):
        return None
    if isinstance(cover, int) and cover >= 0:
        return str(cover)
    return cover if isinstance(cover, str) and cover.isdigit() else None


# ---------------------------------------------------------------------------
# --- change 008 (task 4) --- the lookup cache.
#
# 007 measured 4.5 s p50 per scan against the scoping doc's 3 s line, and 329
# read strings were 88 distinct (title, author) pairs, so a cache keyed on the
# normalised pair answers most lookups on a repeated shelf. The table is
# `lookup_cache` (migration 20260903160000): what the catalogue said for a
# pair, and when. A hit is resolved from `books` without a network call; a
# miss younger than MISS_TTL is returned without a call; an older miss is
# asked again so a newly catalogued book is found. A catalogue error is never
# cached. The store is one read and one write per batch, never per title, and
# a store failure of any kind runs the batch cold (D2 again: never fail a scan
# for a cache).
# ---------------------------------------------------------------------------

MISS_TTL = timedelta(days=30)
KEY_SEPARATOR = "|"  # `normalise` strips punctuation, so the separator cannot occur in either part


@dataclass(frozen=True)
class CacheEntry:
    key: str
    catalogue: str
    catalogue_id: str | None  # None records a miss
    fetched_at: datetime
    record: BookRecord | None  # the `books` row for a hit; None for a miss, or when the row is gone

    @property
    def is_miss(self) -> bool:
        return self.catalogue_id is None

    def fresh(self, now: datetime) -> bool:
        """A record never expires; a miss expires after MISS_TTL."""
        return not self.is_miss or now - self.fetched_at < MISS_TTL


class CacheStore(Protocol):
    """One read and one write per batch. `read` returns None when the store is unavailable."""

    def read(self, keys: list[str]) -> dict[str, CacheEntry] | None: ...

    def write(self, entries: list[CacheEntry]) -> None: ...


def cache_key(title: str, author: str | None) -> str | None:
    """The normalised read string, the separator, the normalised author ('' when none). None for an empty title."""
    t = normalise(title or "")
    if not t:
        return None
    return t + KEY_SEPARATOR + (normalise(author) if author and author.strip() else "")


def consult_cache(items: list[tuple[str, str | None]], cache: CacheStore | None) -> list[Attempt | None] | None:
    """An Attempt for every pair the cache answers, None for every pair the catalogue must be asked.

    None for the whole list when the store is unavailable (or there is none), so the caller
    knows not to write back either."""
    if cache is None:
        return None
    out: list[Attempt | None] = [None] * len(items)
    keys = [cache_key(t, a) for t, a in items]
    wanted = sorted({k for k in keys if k is not None})
    if not wanted:
        return out
    entries = cache.read(wanted)
    if entries is None:
        return None
    now = datetime.now(UTC)
    for i, ((title, author), key) in enumerate(zip(items, keys, strict=True)):
        e = entries.get(key) if key is not None else None
        if e is None or not e.fresh(now):
            continue
        if e.is_miss:
            out[i] = Attempt(None, None, None)
        elif e.record is not None:  # a hit whose book row has gone is asked again
            out[i] = Attempt(Match(e.record, record_score(title, author, e.record)), None, None)
    return out


def remember(items: list[tuple[str, str | None]], queried: list[int], attempts: list[Attempt | None],
             cache: CacheStore | None) -> None:
    """Write what the catalogue answered for the queried pairs: a record or a miss, never an error."""
    if cache is None or not queried:
        return
    now = datetime.now(UTC)
    rows: dict[str, CacheEntry] = {}
    for i in queried:
        a = attempts[i]
        key = cache_key(*items[i])
        if a is None or a.error is not None or key is None:
            continue
        record = a.match.record if a.match is not None else None
        rows[key] = CacheEntry(key, record.catalogue if record else CATALOGUE,
                               record.catalogue_id if record else None, now, record)
    if rows:
        cache.write(list(rows.values()))


def record_score(title: str, author: str | None, record: BookRecord) -> float:
    """The score a cached record gets against the pair as read: `score`'s arithmetic, fed from the book row."""
    doc = {"title": record.title, "author_name": record.author.split(", ") if record.author else []}
    return score(title, author, doc)


class MemoryCache:
    """The store kept in a dict: tests, and the measurement before the migration is pushed."""

    def __init__(self) -> None:
        self.entries: dict[str, CacheEntry] = {}
        self.reads = 0
        self.writes = 0

    def read(self, keys: list[str]) -> dict[str, CacheEntry] | None:
        self.reads += 1
        return {k: self.entries[k] for k in keys if k in self.entries}

    def write(self, entries: list[CacheEntry]) -> None:
        self.writes += 1
        for e in entries:
            self.entries[e.key] = e


class SupabaseCache:
    """The store on the `lookup_cache` and `books` tables. Two selects to read (the cache rows, then
    the book rows they point at), two upserts to write (books first, so the cache's foreign key
    holds). Any failure is logged and the batch runs cold."""

    _BOOK_COLUMNS = "catalogue, catalogue_id, title, author, first_year, cover_id"

    def __init__(self, db) -> None:
        self.db = db

    def read(self, keys: list[str]) -> dict[str, CacheEntry] | None:
        try:
            rows = (self.db.table("lookup_cache").select("key, catalogue, catalogue_id, fetched_at")
                    .in_("key", keys).execute().data or [])
            ids = sorted({r["catalogue_id"] for r in rows if r.get("catalogue_id")})
            books: dict[tuple[str, str], BookRecord] = {}
            if ids:
                for b in self.db.table("books").select(self._BOOK_COLUMNS).in_("catalogue_id", ids).execute().data or []:
                    books[(b["catalogue"], b["catalogue_id"])] = BookRecord(
                        b["catalogue"], b["catalogue_id"], b["title"], b.get("author"), b.get("first_year"), b.get("cover_id"))
            return {r["key"]: CacheEntry(r["key"], r["catalogue"], r.get("catalogue_id"), _parse_ts(r["fetched_at"]),
                                         books.get((r["catalogue"], r.get("catalogue_id")))) for r in rows}
        except Exception as e:  # a cache failure never fails a scan
            log.warning("lookup cache unavailable, running cold: %s", e)
            return None

    def write(self, entries: list[CacheEntry]) -> None:
        try:
            now = datetime.now(UTC).isoformat()
            records = {(e.record.catalogue, e.record.catalogue_id): e.record for e in entries if e.record is not None}
            if records:
                self.db.table("books").upsert([{
                    "catalogue": r.catalogue, "catalogue_id": r.catalogue_id, "title": r.title, "author": r.author,
                    "first_year": r.first_year, "cover_id": r.cover_id, "fetched_at": now,
                } for r in records.values()], on_conflict="catalogue,catalogue_id").execute()
            self.db.table("lookup_cache").upsert([{
                "key": e.key, "catalogue": e.catalogue, "catalogue_id": e.catalogue_id, "fetched_at": e.fetched_at.isoformat(),
            } for e in entries], on_conflict="key").execute()
        except Exception as e:
            log.warning("lookup cache write failed: %s", e)


def cache_for(db=None) -> CacheStore:
    """The store on the app's database; `db` is the Supabase client (a fake in tests), the shared one when None."""
    if db is None:
        from shelfscanner.db import get_client  # local: the module stays importable without settings

        db = get_client()
    return SupabaseCache(db)


def _parse_ts(value: str | datetime) -> datetime:
    if isinstance(value, datetime):
        ts = value
    else:
        ts = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return ts if ts.tzinfo else ts.replace(tzinfo=UTC)


# --- end change 008 ---
