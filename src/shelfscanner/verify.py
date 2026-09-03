"""Verification: the catalogue check between reading and choosing (change 007, task 3).

Every title the extraction read is looked up (`lookup.lookup_batch`). A title
with a record at the threshold is kept under the record's canonical title and
author (scoping L1, L2); a title the catalogue answered for with no record is
dropped and logged; a title whose lookup failed is kept as read and marked
unverified, because a catalogue outage must never fail a scan (007 D2). One
`lookups` row is written per verification and the records found are upserted
into `books`.

What this does not do (recorded in the proposal): resolve an author-only
string by an author search. The lookup module has no author search, so such a
string is looked up as a title and, almost always, dropped.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import UTC, datetime

from shelfscanner import lookup as lk
from shelfscanner.db import get_client
from shelfscanner.router import Progress

log = logging.getLogger(__name__)

NO_RECORD = "no record at the threshold"
DUPLICATE = "same record as an earlier title"
PROGRESS_MESSAGE = "checking titles"


@dataclass(frozen=True)
class Kept:
    """A title the chooser will see. Canonical when verified; as read when the lookup failed."""

    title: str
    author: str | None
    read_title: str
    read_author: str | None
    record: lk.BookRecord | None  # None only when unverified
    score: float | None
    verified: bool

    @property
    def catalogue_id(self) -> str | None:
        return self.record.catalogue_id if self.record else None


@dataclass(frozen=True)
class Dropped:
    title: str  # as read
    author: str | None
    reason: str  # NO_RECORD or DUPLICATE
    nearest: tuple[str, float] | None  # the best candidate under the threshold, or the earlier title for a duplicate


@dataclass(frozen=True)
class Verified:
    photo_id: int
    extraction_id: int
    kept: list[Kept]
    dropped: list[Dropped]
    hits: int
    misses: int  # includes errors, as the `lookups` row does
    errors: int
    latency_ms: int
    lookup_id: int | None  # the `lookups` row
    cache_hits: int = 0  # change 008: titles the lookup cache answered without a catalogue call

    @property
    def unverified(self) -> list[Kept]:
        return [k for k in self.kept if not k.verified]

    @property
    def catalogue_down(self) -> bool:
        """Every lookup failed (D2): the list went through as read."""
        return self.errors > 0 and self.errors == self.hits + self.misses

    def line(self) -> str:
        n = self.hits + self.misses
        status = "CATALOGUE DOWN, list unverified" if self.catalogue_down else (
            f"kept {len(self.kept)}/{n}" + (f" ({len(self.unverified)} unverified)" if self.unverified else "")
            + f"  dropped {len(self.dropped)}")
        lid = f"{self.lookup_id:>3}" if self.lookup_id is not None else "  ?"
        return f"lookup {lid}  photo {self.photo_id}  {status}  errors {self.errors}  cached {self.cache_hits}/{n}  {self.latency_ms}ms"  # change 008: cached

    def lines(self) -> list[str]:
        out = [self.line()]
        for d in self.dropped:
            near = f" (nearest: {d.nearest[0]!r} {d.nearest[1]:.2f})" if d.nearest else ""
            out.append(f"  dropped {d.title!r}: {d.reason}{near}")
        return out


def read_books(parsed_titles: object) -> list[tuple[str, str | None]]:
    """(title, author) pairs as the extraction has them, tolerating the same drift as `extract.titles_from`."""
    if isinstance(parsed_titles, dict):
        items = parsed_titles.get("books") or parsed_titles.get("titles") or []
    elif isinstance(parsed_titles, list):
        items = parsed_titles
    else:
        return []
    out: list[tuple[str, str | None]] = []
    for it in items:
        if isinstance(it, dict) and isinstance(it.get("title"), str) and it["title"].strip():
            author = it.get("author")
            out.append((it["title"].strip(), author.strip() if isinstance(author, str) and author.strip() else None))
        elif isinstance(it, str) and it.strip():
            out.append((it.strip(), None))
    return out


def classify(items: list[tuple[str, str | None]], batch: lk.Batch) -> tuple[list[Kept], list[Dropped]]:
    """Kept and dropped, in the extraction's order. Two titles resolving to one record keep the first."""
    kept: list[Kept] = []
    dropped: list[Dropped] = []
    seen: dict[str, str] = {}  # catalogue id -> the canonical title already kept
    for (title, author), match, error, nearest in zip(items, batch.matches, batch.item_errors, batch.nearest, strict=True):
        if match is not None:
            r = match.record
            if r.catalogue_id in seen:
                dropped.append(Dropped(title, author, DUPLICATE, (seen[r.catalogue_id], match.score)))
                continue
            seen[r.catalogue_id] = r.title
            kept.append(Kept(r.title, r.author or author, title, author, r, match.score, True))
        elif error is not None:  # the catalogue failed for this title: kept as read, unverified (D2)
            kept.append(Kept(title, author, title, author, None, None, False))
        else:
            dropped.append(Dropped(title, author, NO_RECORD, nearest))
    return kept, dropped


def record(db, photo_id: int, batch: lk.Batch, kept: list[Kept]) -> int | None:
    """Upsert the records found into `books`; insert the scan's `lookups` row. Returns the row id."""
    rows: dict[tuple[str, str], dict] = {}
    now = datetime.now(UTC).isoformat()
    for k in kept:
        r = k.record
        if r is not None:
            rows[(r.catalogue, r.catalogue_id)] = {
                "catalogue": r.catalogue, "catalogue_id": r.catalogue_id, "title": r.title, "author": r.author,
                "first_year": r.first_year, "cover_id": r.cover_id, "fetched_at": now,
            }
    if rows:
        db.table("books").upsert(list(rows.values()), on_conflict="catalogue,catalogue_id").execute()
    res = db.table("lookups").insert({
        "photo_id": photo_id, "hits": batch.hits, "misses": batch.misses, "errors": batch.errors,
        "latency_ms": batch.latency_ms, "cache_hits": batch.cache_hits,  # change 008: cache_hits
    }).execute()
    return res.data[0]["id"] if res.data else None


def verify_extraction(extraction: dict, *, client: lk.Transport | None = None, db=None,
                      on_progress: Progress | None = None, concurrency: int = 6) -> Verified:
    """Look up every title in an extraction row and split the list into kept and dropped.

    `client` is the catalogue transport (a stub in tests), `db` the Supabase client (a fake in
    tests). Never raises for a catalogue failure: with the catalogue down, every title is kept
    unverified and the errors are counted (D2).
    """
    if on_progress is not None:
        on_progress(PROGRESS_MESSAGE)
    items = read_books(extraction["parsed_titles"])
    batch = lk.lookup_batch(items, concurrency=concurrency, client=client, cache=lk.cache_for(db))  # change 008: cache
    kept, dropped = classify(items, batch)
    lookup_id = record(db or get_client(), extraction["photo_id"], batch, kept)
    v = Verified(extraction["photo_id"], extraction["id"], kept, dropped,
                 batch.hits, batch.misses, batch.errors, batch.latency_ms, lookup_id, cache_hits=batch.cache_hits)  # change 008
    if v.catalogue_down:
        log.warning("catalogue unavailable for extraction %s: %d titles passed through unverified", extraction["id"], len(kept))
    for d in dropped:
        log.info("dropped %r (%s) for extraction %s", d.title, d.reason, extraction["id"])
    return v
