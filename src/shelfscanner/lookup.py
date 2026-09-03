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
from dataclasses import dataclass
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
                 client: Transport | None = None, timeout_s: float = 4.0) -> Batch:
    """Look up every (title, author) pair with at most `concurrency` requests in flight."""
    started = time.perf_counter()
    if not items:
        return Batch([], 0, 0, 0, 0)
    with ThreadPoolExecutor(max_workers=max(1, concurrency)) as pool:
        attempts = list(pool.map(lambda it: _attempt(it[0], it[1], client=client, timeout_s=timeout_s), items))
    matches = [m for m, _ in attempts]
    hits = sum(m is not None for m in matches)
    errors = sum(e is not None for _, e in attempts)
    return Batch(matches, hits, len(items) - hits, errors, int((time.perf_counter() - started) * 1000))


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
    if not title or not title.strip():
        return None, None
    threshold = load_config().match_threshold
    for q_title, q_author in query_variants(title, author):
        docs, error = _search(q_title, q_author, client=client, timeout_s=timeout_s)
        if error is not None:
            return None, error
        match = best_match(title, author, docs, threshold)
        if match is not None:
            return match, None
    return None, None


def _search(title: str, author: str | None, *, client: Transport | None,
            timeout_s: float) -> tuple[list[dict[str, Any]], str | None]:
    """Returns (docs, error). Any failure is an error string, never an exception (D2)."""
    c = client or _default_client()
    try:
        r = c.get(SEARCH_URL, params=query_params(title, author), headers={"User-Agent": USER_AGENT}, timeout=timeout_s)
        if r.status_code != 200:
            error = f"http {r.status_code}"
        else:
            docs = r.json().get("docs")
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
        cover_id=str(cover) if isinstance(cover, int) else None,
    )
