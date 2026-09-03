"""Verification (007 task 3) against recorded Open Library replies and a fake database; nothing touches the network."""

from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace

import httpx

from shelfscanner import verify as vf
from shelfscanner.config import load_config
from shelfscanner.recommend import Recommendation as R
from shelfscanner.recommend import annotate_picks, check, verified_shelf_text

FIXTURES = Path(__file__).parent / "fixtures"
T = load_config().match_threshold

BY_TITLE = {  # what the recorded fixture answers for each query title
    "American Gods": "american_gods", "Americn Gods": "american_gods",
    "This Is How You Lose the Time War": "time_war", "How You Lose the Time War": "time_war",
    "Im Westen nichts Neues": "im_westen",
}


def reply(name: str) -> httpx.Response:
    f = json.loads((FIXTURES / f"openlibrary_{name}.json").read_text())
    return httpx.Response(f["status"], json=f["response"])


class StubCatalogue:
    def __init__(self, responder=None):
        self.responder = responder or (lambda p: reply(BY_TITLE.get(p["title"], "miss")))
        self.calls = 0

    def get(self, url, *, params, headers, timeout):
        self.calls += 1
        out = self.responder(params)
        if isinstance(out, Exception):
            raise out
        return out


class FakeTable:
    def __init__(self, db, name):
        self.db, self.name, self.op = db, name, None

    def upsert(self, rows, on_conflict=None):
        self.op = ("upsert", rows, on_conflict)
        return self

    def select(self, columns):  # the cache store reads `lookup_cache` and `books` (008)
        self.op = ("select", None, None)
        self.filter = None
        return self

    def in_(self, column, values):
        self.filter = (column, set(values))
        return self

    def insert(self, row):
        self.op = ("insert", row, None)
        return self

    def execute(self):
        kind, payload, on_conflict = self.op
        store = self.db.tables.setdefault(self.name, [])
        if kind == "select":
            column, values = self.filter or (None, None)
            return SimpleNamespace(data=[r for r in store if column is None or r.get(column) in values])
        rows = payload if isinstance(payload, list) else [payload]
        out = []
        keys = on_conflict.split(",") if on_conflict else None
        for r in rows:
            existing = next((s for s in store if keys and all(s.get(k) == r.get(k) for k in keys)), None)
            if existing is not None:  # Postgres would update the row in place
                existing.update(r)
                out.append(existing)
                continue
            row = {**r, "id": len(store) + 1}
            store.append(row)
            out.append(row)
        self.db.ops.append((self.name, kind, on_conflict))
        return SimpleNamespace(data=out)


class FakeDB:
    def __init__(self):
        self.tables: dict[str, list[dict]] = {}
        self.ops: list[tuple] = []

    def table(self, name):
        return FakeTable(self, name)


def extraction(*books, photo_id=7, id=42) -> dict:
    return {"id": id, "photo_id": photo_id, "parsed_titles": {"books": [
        {"title": t, "author": a} for t, a in books]}}


def test_all_found_are_kept_under_the_canonical_title_and_recorded():
    db = FakeDB()
    v = vf.verify_extraction(
        extraction(("American Gods", "Neil Gaiman"), ("This Is How You Lose the Time War", None)),
        client=StubCatalogue(), db=db)
    assert [k.title for k in v.kept] == ["American Gods", "This is How You Lose the Time War"]
    assert [k.author for k in v.kept] == ["Neil Gaiman", "Amal El-Mohtar, Max Gladstone"]
    assert all(k.verified and k.record is not None for k in v.kept)
    assert v.dropped == [] and v.unverified == [] and not v.catalogue_down
    assert (v.hits, v.misses, v.errors) == (2, 0, 0)
    assert v.photo_id == 7 and v.extraction_id == 42 and v.lookup_id == 1
    [lookups_row] = db.tables["lookups"]
    assert {k: lookups_row[k] for k in ("photo_id", "hits", "misses", "errors")} == {
        "photo_id": 7, "hits": 2, "misses": 0, "errors": 0}
    assert lookups_row["latency_ms"] >= 0
    books = db.tables["books"]
    assert [b["catalogue_id"] for b in books] == ["OL679360W", "OL19859295W"]
    assert books[0]["title"] == "American Gods" and books[0]["cover_id"] == "8494659" and books[0]["first_year"] == 2001
    assert ("books", "upsert", "catalogue,catalogue_id") in db.ops


def test_a_title_with_no_record_is_dropped_with_the_nearest_candidate_named():
    db = FakeDB()
    c = StubCatalogue(lambda p: reply("american_gods") if p["title"] != "Zorbulon Quantum Shelf Diaries" else reply("miss"))
    v = vf.verify_extraction(
        extraction(("American Gods", "Neil Gaiman"), ("Zorbulon Quantum Shelf Diaries", None), ("American Psycho", None)),
        client=c, db=db)
    assert [k.title for k in v.kept] == ["American Gods"]
    assert [(d.title, d.reason) for d in v.dropped] == [
        ("Zorbulon Quantum Shelf Diaries", vf.NO_RECORD), ("American Psycho", vf.NO_RECORD)]
    assert v.dropped[0].nearest is None  # the catalogue returned nothing at all
    assert v.dropped[1].nearest is not None and v.dropped[1].nearest[0] == "American Gods" and v.dropped[1].nearest[1] < T
    assert (v.hits, v.misses, v.errors) == (1, 2, 0)
    assert db.tables["lookups"][0]["misses"] == 2
    assert len(db.tables["books"]) == 1
    assert v.lines()[1].startswith("  dropped 'Zorbulon Quantum Shelf Diaries': no record")


def test_catalogue_down_keeps_every_title_as_read_and_unverified():
    db = FakeDB()
    c = StubCatalogue(lambda p: httpx.ConnectError("refused"))
    v = vf.verify_extraction(extraction(("American Gods", "Neil Gaiman"), ("Made Up Title", None)), client=c, db=db)
    assert v.catalogue_down
    assert [(k.title, k.author, k.verified, k.record) for k in v.kept] == [
        ("American Gods", "Neil Gaiman", False, None), ("Made Up Title", None, False, None)]
    assert v.dropped == [] and len(v.unverified) == 2
    assert (v.hits, v.misses, v.errors) == (0, 2, 2)
    assert db.tables["lookups"][0]["errors"] == 2
    assert "books" not in db.tables  # nothing found, nothing upserted
    assert "CATALOGUE DOWN" in v.line()
    # The chooser still gets a list, and R1 checks against it, so the scan completes (D2).
    assert verified_shelf_text(v) == "- American Gods — Neil Gaiman\n- Made Up Title"
    assert check([R("Made Up Title", "")], [k.title for k in v.kept], [], T).vs_extraction == 1


def test_one_failed_lookup_is_kept_unverified_while_the_rest_are_checked():
    c = StubCatalogue(lambda p: httpx.ReadTimeout("slow") if p["title"] == "Im Westen nichts Neues"
                      else reply(BY_TITLE.get(p["title"], "miss")))
    v = vf.verify_extraction(
        extraction(("American Gods", None), ("Im Westen nichts Neues", None), ("Nothing Here", None)), client=c, db=FakeDB())
    assert [(k.title, k.verified) for k in v.kept] == [("American Gods", True), ("Im Westen nichts Neues", False)]
    assert [d.title for d in v.dropped] == ["Nothing Here"]
    assert not v.catalogue_down and v.errors == 1
    assert "(1 unverified)" in v.line()


def test_misspelling_and_fragment_resolve_to_the_canonical_title():
    v = vf.verify_extraction(
        extraction(("Americn Gods", "Neil Gaiman"), ("How You Lose the Time War", None)), client=StubCatalogue(), db=FakeDB())
    assert [(k.read_title, k.title) for k in v.kept] == [
        ("Americn Gods", "American Gods"), ("How You Lose the Time War", "This is How You Lose the Time War")]
    assert all(k.verified and k.score is not None and T <= k.score <= 1.0 for k in v.kept)
    assert v.dropped == []


def test_two_titles_resolving_to_one_record_keep_the_first():
    db = FakeDB()
    v = vf.verify_extraction(extraction(("American Gods", "Neil Gaiman"), ("Americn Gods", None)), client=StubCatalogue(), db=db)
    assert [k.title for k in v.kept] == ["American Gods"]
    assert [(d.title, d.reason, d.nearest[0]) for d in v.dropped] == [("Americn Gods", vf.DUPLICATE, "American Gods")]
    assert len(db.tables["books"]) == 1  # one upsert row per record, or Postgres refuses the statement
    assert v.hits == 2  # the lookups row counts what the catalogue found; the merge is verification's


def test_empty_titles_are_skipped_and_progress_is_reported():
    seen = []
    c = StubCatalogue()
    v = vf.verify_extraction({"id": 1, "photo_id": 2, "parsed_titles": {"books": [
        {"title": "  ", "author": None}, {"title": "American Gods", "author": " Neil Gaiman "}]}},
        client=c, db=FakeDB(), on_progress=seen.append)
    assert seen == [vf.PROGRESS_MESSAGE]
    assert [(k.read_title, k.read_author) for k in v.kept] == [("American Gods", "Neil Gaiman")]
    assert v.hits + v.misses == 1
    assert vf.read_books(["Bare String", {"title": "X"}, 3, {"nope": 1}]) == [("Bare String", None), ("X", None)]
    assert vf.read_books("garbage") == []


def test_nothing_read_still_writes_a_zero_row():
    db = FakeDB()
    v = vf.verify_extraction({"id": 1, "photo_id": 2, "parsed_titles": {"books": []}}, client=StubCatalogue(), db=db)
    assert v.kept == [] and v.dropped == [] and not v.catalogue_down
    assert db.tables["lookups"][0]["hits"] == 0 and db.tables["lookups"][0]["misses"] == 0


def test_picks_carry_verified_and_the_record():
    v = vf.verify_extraction(
        extraction(("American Gods", "Neil Gaiman"), ("Im Westen nichts Neues", None)),
        client=StubCatalogue(lambda p: httpx.ConnectError("x") if p["title"].startswith("Im") else reply("american_gods")),
        db=FakeDB())
    parsed = {"recommendations": [
        {"title": "american gods", "reason": "r1"}, {"title": "Im Westen nichts Neues", "reason": "r2"},
        {"title": "Dune", "reason": "off the list"}, "not a pick"]}
    out = annotate_picks(parsed, v, T)
    recs = out["recommendations"]
    assert recs[0] == {"title": "american gods", "reason": "r1", "verified": True, "catalogue_id": "OL679360W", "cover_id": "8494659",
                       "author": "Neil Gaiman"}
    assert recs[1] == {"title": "Im Westen nichts Neues", "reason": "r2", "verified": False, "catalogue_id": None, "cover_id": None,
                       "author": None}
    assert recs[2] == {"title": "Dune", "reason": "off the list", "verified": False, "catalogue_id": None, "cover_id": None,
                       "author": None}
    assert recs[3] == "not a pick"
    assert parsed["recommendations"][0] == {"title": "american gods", "reason": "r1"}  # the reply itself is not mutated
    assert annotate_picks([{"title": "American Gods"}], v, T) == [
        {"title": "American Gods", "verified": True, "catalogue_id": "OL679360W", "cover_id": "8494659", "author": "Neil Gaiman"}]
    assert annotate_picks("garbage", v, T) == "garbage"


def test_the_row_handed_back_carries_the_author_and_cover_like_the_stored_one(monkeypatch):
    # The live panel is built from the returned row, a reload from the stored one; without this the
    # covers and authors only appeared after a refresh (2026-09-03, reported by Marina).
    from shelfscanner import recommend as rc
    from shelfscanner.web.fakes import FakeClient
    db = FakeDB()
    v = vf.verify_extraction(extraction(("American Gods", "Neil Gaiman"), ("Made Up Title", None)), client=StubCatalogue(), db=db)
    monkeypatch.setattr(rc, "get_client", lambda: db)
    monkeypatch.setattr(rc, "get_photo", lambda photo_id: {"titles": []})
    client = FakeClient(picks={"recommendations": [{"title": "American Gods", "reason": "r1"}]})
    row = rc.recommend_from_extraction(extraction(("American Gods", "Neil Gaiman")), None, {}, rc.DEFAULT_PROMPT,
                                       client=client, verified=v, guard=False)
    assert row.error is None
    assert [(r.title, r.author, r.cover_id) for r in row.recs] == [("American Gods", "Neil Gaiman", "8494659")]
    stored = db.tables["recommendations"][0]["parsed_recommendations"]["recommendations"][0]
    assert (stored["author"], stored["cover_id"]) == ("Neil Gaiman", "8494659")
