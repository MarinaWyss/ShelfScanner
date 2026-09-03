"""The lookup cache (change 008, task 4) against a stubbed catalogue and a stubbed store; nothing touches the network."""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from pathlib import Path
from types import SimpleNamespace

import httpx

from shelfscanner import lookup as lk
from shelfscanner import verify as vf

FIXTURES = Path(__file__).parent / "fixtures"

BY_TITLE = {"American Gods": "american_gods", "This Is How You Lose the Time War": "time_war",
            "Im Westen nichts Neues": "im_westen"}
GODS = lk.BookRecord("openlibrary", "OL679360W", "American Gods", "Neil Gaiman", 2001, "8494659")
WAR = lk.BookRecord("openlibrary", "OL19859295W", "This is How You Lose the Time War", "Amal El-Mohtar, Max Gladstone", 2019, "8601933")
NOW = datetime.now(UTC)


def reply(name: str) -> httpx.Response:
    f = json.loads((FIXTURES / f"openlibrary_{name}.json").read_text())
    return httpx.Response(f["status"], json=f["response"])


class StubCatalogue:
    def __init__(self, responder=None):
        self.responder = responder or (lambda p: reply(BY_TITLE.get(p["title"], "miss")))
        self.calls: list[dict] = []

    def get(self, url, *, params, headers, timeout):
        self.calls.append(params)
        out = self.responder(params)
        if isinstance(out, Exception):
            raise out
        return out


def entry(key: str, record: lk.BookRecord | None, *, age: timedelta = timedelta(0)) -> lk.CacheEntry:
    return lk.CacheEntry(key, "openlibrary", record.catalogue_id if record else None, NOW - age, record)


def warm(*entries: lk.CacheEntry) -> lk.MemoryCache:
    c = lk.MemoryCache()
    c.write(list(entries))
    c.writes = 0
    return c


# --- the key ----------------------------------------------------------------


def test_key_is_the_normalised_pair_with_a_separator_and_an_empty_author_when_none():
    assert lk.cache_key("American Gods", "Neil Gaiman") == "american gods|neil gaiman"
    assert lk.cache_key("The Hobbit", None) == "hobbit|"
    assert lk.cache_key("Hobbit, The", "  ") == "hobbit|"
    # Punctuation and accents fold, so the two readings of the Fraktur spine share one row (007 results).
    assert lk.cache_key("Schalk: Götter und Heldensagen", None) == lk.cache_key("Schalk – Gotter und Heldensagen", None)
    assert lk.cache_key("", "Someone") is None and lk.cache_key("  ", None) is None


# --- reads ------------------------------------------------------------------


def test_all_cached_hits_make_no_catalogue_call_and_resolve_from_the_book_rows():
    c = StubCatalogue()
    cache = warm(entry("american gods|neil gaiman", GODS), entry("this is how you lose the time war|", WAR))
    b = lk.lookup_batch([("American Gods", "Neil Gaiman"), ("This Is How You Lose the Time War", None)], client=c, cache=cache)
    assert c.calls == []
    assert [m.record for m in b.matches] == [GODS, WAR]
    assert b.matches[0].score == 1.0 and b.matches[1].score == 1.0
    assert (b.hits, b.misses, b.errors, b.cache_hits) == (2, 0, 0, 2)
    assert b.item_errors == [None, None] and b.nearest == [None, None]
    assert cache.reads == 1 and cache.writes == 0  # one read for the batch, nothing to write back


def test_a_fresh_miss_is_returned_without_a_call_and_an_expired_one_is_asked_again():
    c = StubCatalogue()
    cache = warm(entry("nothing here|", None, age=timedelta(days=29)),
                 entry("american gods|", None, age=lk.MISS_TTL + timedelta(seconds=1)))
    b = lk.lookup_batch([("Nothing Here", None), ("American Gods", None)], client=c, cache=cache)
    assert [p["title"] for p in c.calls] == ["American Gods"]  # only the expired miss went to the catalogue
    assert b.matches[0] is None and b.matches[1] is not None and b.matches[1].record == GODS
    assert (b.hits, b.misses, b.cache_hits) == (1, 1, 1)
    refreshed = cache.entries["american gods|"]
    assert refreshed.catalogue_id == "OL679360W" and refreshed.record == GODS and refreshed.fetched_at > NOW


def test_a_cached_hit_whose_book_row_is_gone_is_asked_again():
    c = StubCatalogue()
    cache = warm(lk.CacheEntry("american gods|", "openlibrary", "OL679360W", NOW, None))
    b = lk.lookup_batch([("American Gods", None)], client=c, cache=cache)
    assert len(c.calls) == 1 and b.matches[0].record == GODS and b.cache_hits == 0
    assert cache.entries["american gods|"].record == GODS


# --- writes -----------------------------------------------------------------


def test_a_cold_batch_writes_a_row_per_pair_with_a_null_id_for_a_miss_and_none_for_an_error():
    c = StubCatalogue(lambda p: httpx.ReadTimeout("slow") if p["title"] == "Im Westen nichts Neues"
                      else reply(BY_TITLE.get(p["title"], "miss")))
    cache = lk.MemoryCache()
    items = [("American Gods", "Neil Gaiman"), ("Zorbulon Quantum Shelf Diaries", None), ("Im Westen nichts Neues", None), ("", None)]
    b = lk.lookup_batch(items, client=c, cache=cache)
    assert (b.hits, b.misses, b.errors, b.cache_hits) == (1, 3, 1, 0)
    assert cache.reads == 1 and cache.writes == 1
    assert sorted(cache.entries) == ["american gods|neil gaiman", "zorbulon quantum shelf diaries|"]
    hit, miss = cache.entries["american gods|neil gaiman"], cache.entries["zorbulon quantum shelf diaries|"]
    assert hit.catalogue_id == "OL679360W" and hit.record == GODS and not hit.is_miss
    assert miss.catalogue_id is None and miss.record is None and miss.is_miss and miss.fresh(NOW)
    # The same shelf again: two answers from the cache, the failed one asked again.
    c.calls.clear()
    b2 = lk.lookup_batch(items, client=c, cache=cache)
    assert [p["title"] for p in c.calls] == ["Im Westen nichts Neues"]
    assert (b2.hits, b2.misses, b2.errors, b2.cache_hits) == (1, 3, 1, 2)


def test_cache_hits_counts_records_and_fresh_misses_but_not_expired_or_unknown_pairs():
    c = StubCatalogue()
    cache = warm(entry("american gods|neil gaiman", GODS), entry("nothing here|", None),
                 entry("old miss|", None, age=timedelta(days=31)))
    b = lk.lookup_batch([("American Gods", "Neil Gaiman"), ("Nothing Here", None), ("Old Miss", None),
                         ("This Is How You Lose the Time War", None)], client=c, cache=cache)
    assert b.cache_hits == 2 and len(c.calls) > 0
    assert (b.hits, b.misses) == (2, 2)


def test_no_cache_and_an_unavailable_cache_both_run_cold_and_write_nothing():
    class Down:
        def read(self, keys):
            return None

        def write(self, entries):
            raise AssertionError("must not write when the read failed")

    c = StubCatalogue()
    b = lk.lookup_batch([("American Gods", None)], client=c, cache=Down())
    assert len(c.calls) == 1 and b.matches[0].record == GODS and b.cache_hits == 0
    c2 = StubCatalogue()
    assert lk.lookup_batch([("American Gods", None)], client=c2).cache_hits == 0 and len(c2.calls) == 1
    assert lk.lookup_batch([], client=c2, cache=lk.MemoryCache()) == lk.Batch([], 0, 0, 0, 0)


# --- the Supabase store, over a fake that speaks the client's chained calls ---


class FakeQuery:
    def __init__(self, db, name):
        self.db, self.name = db, name
        self.filters: list[tuple[str, object]] = []
        self.op = None

    def select(self, columns):
        self.op = ("select", None, None)
        return self

    def in_(self, column, values):
        self.filters.append((column, list(values)))
        return self

    def upsert(self, rows, on_conflict=None):
        self.op = ("upsert", rows, on_conflict)
        return self

    def insert(self, row):
        self.op = ("insert", row, None)
        return self

    def execute(self):
        kind, payload, on_conflict = self.op
        store = self.db.tables.setdefault(self.name, [])
        self.db.ops.append((self.name, kind))
        if kind == "select":
            rows = [r for r in store if all(r.get(c) in vs for c, vs in self.filters)]
            return SimpleNamespace(data=[dict(r) for r in rows])
        rows = payload if isinstance(payload, list) else [payload]
        keys = tuple(on_conflict.split(",")) if on_conflict else None
        out = []
        for r in rows:
            existing = next((s for s in store if keys and all(s.get(k) == r.get(k) for k in keys)), None)
            if existing is not None:
                existing.update(r)
                out.append(existing)
            else:
                row = {**r, "id": len(store) + 1}
                store.append(row)
                out.append(row)
        return SimpleNamespace(data=out)


class FakeDB:
    def __init__(self):
        self.tables: dict[str, list[dict]] = {}
        self.ops: list[tuple] = []

    def table(self, name):
        return FakeQuery(self, name)


def test_supabase_store_writes_books_then_cache_rows_and_reads_them_back_in_two_selects():
    db = FakeDB()
    store = lk.cache_for(db)
    store.write([entry("american gods|neil gaiman", GODS), entry("nothing here|", None)])
    assert db.ops == [("books", "upsert"), ("lookup_cache", "upsert")]
    [book] = db.tables["books"]
    assert book["catalogue_id"] == "OL679360W" and book["title"] == "American Gods" and book["cover_id"] == "8494659"
    rows = {r["key"]: r for r in db.tables["lookup_cache"]}
    assert rows["american gods|neil gaiman"]["catalogue_id"] == "OL679360W"
    assert rows["nothing here|"]["catalogue_id"] is None and rows["nothing here|"]["catalogue"] == "openlibrary"
    assert isinstance(rows["nothing here|"]["fetched_at"], str)  # ISO text, as the client sends it

    db.ops.clear()
    got = store.read(["american gods|neil gaiman", "nothing here|", "unknown|"])
    assert db.ops == [("lookup_cache", "select"), ("books", "select")]
    assert sorted(got) == ["american gods|neil gaiman", "nothing here|"]
    assert got["american gods|neil gaiman"].record == GODS and got["american gods|neil gaiman"].fetched_at.tzinfo is not None
    assert got["nothing here|"].is_miss and got["nothing here|"].record is None

    db.ops.clear()  # a batch of pure misses needs no books select
    store.read(["nothing here|"])
    assert db.ops == [("lookup_cache", "select")]


def test_supabase_store_failures_are_logged_not_raised():
    class Broken:
        def table(self, name):
            raise RuntimeError("connection refused")

    store = lk.cache_for(Broken())
    assert store.read(["x|"]) is None
    store.write([entry("x|", None)])  # no exception


def test_verification_records_cache_hits_on_the_lookups_row_and_shows_them():
    db = FakeDB()
    ex = {"id": 42, "photo_id": 7, "parsed_titles": {"books": [
        {"title": "American Gods", "author": "Neil Gaiman"}, {"title": "Zorbulon Quantum Shelf Diaries", "author": None}]}}
    cold = StubCatalogue()
    v1 = vf.verify_extraction(ex, client=cold, db=db)
    assert v1.cache_hits == 0 and len(cold.calls) > 0
    assert db.tables["lookups"][0]["cache_hits"] == 0
    assert len(db.tables["books"]) == 1  # written once by the store, refreshed by verify's own upsert
    assert sorted(r["key"] for r in db.tables["lookup_cache"]) == ["american gods|neil gaiman", "zorbulon quantum shelf diaries|"]

    warm_ = StubCatalogue()
    v2 = vf.verify_extraction(ex, client=warm_, db=db)
    assert warm_.calls == []
    assert v2.cache_hits == 2 and (v2.hits, v2.misses) == (1, 1)
    assert [k.title for k in v2.kept] == ["American Gods"] and [d.title for d in v2.dropped] == ["Zorbulon Quantum Shelf Diaries"]
    assert v2.dropped[0].nearest is None  # a cached miss carries no nearest candidate
    assert db.tables["lookups"][1]["cache_hits"] == 2
    assert "cached 2/2" in v2.line()
