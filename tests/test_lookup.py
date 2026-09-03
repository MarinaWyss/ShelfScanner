"""Lookup runs against recorded Open Library replies through a stubbed client; nothing here touches the network."""

from __future__ import annotations

import json
import threading
from pathlib import Path

import httpx
import pytest

from shelfscanner import lookup as lk
from shelfscanner.config import load_config

FIXTURES = Path(__file__).parent / "fixtures"


def fixture(name: str) -> dict:
    return json.loads((FIXTURES / f"openlibrary_{name}.json").read_text())


def reply(name: str) -> httpx.Response:
    f = fixture(name)
    return httpx.Response(f["status"], json=f["response"])


class StubClient:
    """Answers each request from `responder(params)`; records what was sent."""

    def __init__(self, responder):
        self.responder = responder
        self.calls: list[dict] = []

    def get(self, url, *, params, headers, timeout):
        self.calls.append({"url": url, "params": params, "headers": headers, "timeout": timeout})
        out = self.responder(params)
        if isinstance(out, Exception):
            raise out
        return out


def stub(name: str) -> StubClient:
    return StubClient(lambda params: reply(name))


T = load_config().match_threshold


def test_hit_with_author_returns_the_work_record():
    m = lk.lookup("American Gods", "Neil Gaiman", client=stub("american_gods"))
    assert m is not None and m.score == 1.0
    assert m.record == lk.BookRecord("openlibrary", "OL679360W", "American Gods", "Neil Gaiman", 2001, "8494659")


def test_request_shape_matches_the_api_and_identifies_us():
    c = stub("american_gods")
    lk.lookup("American Gods", "Neil Gaiman", client=c, timeout_s=2.5)
    [call] = c.calls
    assert call["url"] == "https://openlibrary.org/search.json"
    assert call["params"] == {"title": "American Gods", "author": "Neil Gaiman", "fields": lk.FIELDS, "limit": 5}
    assert call["headers"]["User-Agent"].startswith("ShelfScanner/")
    assert call["timeout"] == 2.5


def test_german_title_takes_the_first_of_equal_candidates():
    # Docs 0 and 3 are both "Im Westen nichts Neues"; the catalogue's relevance order breaks the tie.
    m = lk.lookup("Im Westen nichts Neues", None, client=stub("im_westen"))
    assert m is not None
    assert m.record.catalogue_id == "OL1209288W"
    assert m.record.author == "Erich Maria Remarque"
    assert m.record.first_year == 1928


def test_two_authors_are_joined_and_casing_is_harmless():
    m = lk.lookup("This Is How You Lose the Time War", "Amal El-Mohtar", client=stub("time_war"))
    assert m is not None and m.score == 1.0
    assert m.record.title == "This is How You Lose the Time War"
    assert m.record.author == "Amal El-Mohtar, Max Gladstone"


def test_surname_only_author_counts_as_a_match():
    m = lk.lookup("The Psychology of Money", "Housel", client=stub("psychology_of_money"))
    assert m is not None and m.record.catalogue_id == "OL21640039W"
    assert lk.author_matches("Housel", ["Morgan Housel"])
    assert lk.author_matches("Erich Remarque", ["Erich Maria Remarque"])
    assert not lk.author_matches("Stephen King", ["Neil Gaiman"])
    assert not lk.author_matches("Li", ["Li Cunxin"])  # a two-letter surname is too easy to share


def test_author_bonus_lifts_a_near_title_but_is_capped():
    doc = fixture("american_gods")["response"]["docs"][0]
    without = lk.score("Americn Gods", None, doc)
    with_author = lk.score("Americn Gods", "Neil Gaiman", doc)
    assert with_author == pytest.approx(min(1.0, without + lk.AUTHOR_BONUS))
    assert lk.score("American Gods", "Neil Gaiman", doc) == 1.0


def test_wrong_title_is_none_even_with_the_right_author():
    docs = fixture("american_gods")["response"]["docs"]
    assert lk.best_match("American Psycho", "Neil Gaiman", docs, T) is None


def test_no_results_is_a_miss_not_an_error():
    b = lk.lookup_batch([("Zorbulon Quantum Shelf Diaries", None)], client=stub("miss"))
    assert b.matches == [None] and b.hits == 0 and b.misses == 1 and b.errors == 0


def test_author_query_with_nothing_retries_on_title_alone():
    c = StubClient(lambda p: reply("miss") if "author" in p else reply("american_gods"))
    m = lk.lookup("American Gods", "Neil Gaimen", client=c)
    assert m is not None and m.record.catalogue_id == "OL679360W"
    assert [("author" in call["params"]) for call in c.calls] == [True, False]


def test_subtitle_the_catalogue_lacks_is_retried_on_the_main_title():
    # Recorded: the full title finds nothing, "Apocalypse Never" alone finds Shellenberger first.
    c = StubClient(lambda p: reply("apocalypse_full") if ":" in p["title"] else reply("apocalypse_main"))
    m = lk.lookup("Apocalypse Never: Why Environmental Alarmism Hurts Us All", None, client=c)
    assert m is not None and m.score == 1.0
    assert m.record.author == "Michael Shellenberger" and m.record.first_year == 2020
    assert [call["params"]["title"] for call in c.calls] == [
        "Apocalypse Never: Why Environmental Alarmism Hurts Us All", "Apocalypse Never"]


def test_query_variants_most_specific_first_without_duplicates():
    assert lk.query_variants("Dune", None) == [("Dune", None)]
    assert lk.query_variants("Dune", "Herbert") == [("Dune", "Herbert"), ("Dune", None)]
    assert lk.query_variants("A: B", None) == [("A: B", None), ("A", None)]
    assert lk.query_variants("A: B", " X ") == [("A: B", "X"), ("A", "X"), ("A: B", None), ("A", None)]
    assert lk.query_variants(": B", None) == [(": B", None)]


def test_a_true_miss_stops_after_the_variants():
    c = stub("miss")
    assert lk.lookup("Nothing Here", None, client=c) is None
    assert len(c.calls) == 1
    c = stub("miss")
    assert lk.lookup("Nothing: Here", "Nobody", client=c) is None
    assert len(c.calls) == 4


@pytest.mark.parametrize(
    "failure",
    [
        httpx.ConnectTimeout("timed out"),
        httpx.ConnectError("refused"),
        httpx.Response(503, text="down"),
        httpx.Response(429, text="slow down"),
        httpx.Response(200, text="<html>not json</html>"),
        httpx.Response(200, json={"docs": "wrong shape"}),
    ],
)
def test_catalogue_failures_return_none_and_are_counted(failure):
    c = StubClient(lambda p: failure)
    assert lk.lookup("American Gods", "Neil Gaiman", client=c) is None
    b = lk.lookup_batch([("American Gods", "Neil Gaiman")], client=c)
    assert b.matches == [None] and b.hits == 0 and b.misses == 1 and b.errors == 1


def test_empty_title_makes_no_request():
    c = stub("american_gods")
    assert lk.lookup("  ", "Neil Gaiman", client=c) is None
    assert c.calls == []


def test_lookup_many_keeps_order_and_runs_in_parallel_within_the_bound():
    items = [("American Gods", "Neil Gaiman"), ("Nothing", None), ("This Is How You Lose the Time War", None),
             ("Im Westen nichts Neues", None)]
    by_title = {"American Gods": "american_gods", "Nothing": "miss",
                "This Is How You Lose the Time War": "time_war", "Im Westen nichts Neues": "im_westen"}
    concurrency = 2
    gate = threading.Barrier(concurrency, timeout=5)  # trips only if two requests overlap
    lock, in_flight, peak = threading.Lock(), [0], [0]

    def responder(params):
        with lock:
            in_flight[0] += 1
            peak[0] = max(peak[0], in_flight[0])
        try:
            gate.wait()
        except threading.BrokenBarrierError:  # the last, odd request has no partner
            pass
        finally:
            with lock:
                in_flight[0] -= 1
        return reply(by_title[params["title"]])

    got = lk.lookup_many(items, concurrency=concurrency, client=StubClient(responder))
    assert [m.record.catalogue_id if m else None for m in got] == ["OL679360W", None, "OL19859295W", "OL1209288W"]
    assert peak[0] == concurrency


def test_batch_counts_and_latency():
    c = StubClient(lambda p: reply("american_gods") if p["title"] == "American Gods" else reply("miss"))
    b = lk.lookup_batch([("American Gods", None), ("Nope", None), ("", None)], client=c)
    assert (b.hits, b.misses, b.errors) == (1, 2, 0)
    assert b.latency_ms >= 0
    assert lk.lookup_batch([], client=c) == lk.Batch([], 0, 0, 0, 0)


def test_record_from_a_sparse_doc():
    assert lk.to_record({"key": "/works/OL1W", "title": "Bare"}) == lk.BookRecord("openlibrary", "OL1W", "Bare", None, None, None)
    assert lk.to_record({"title": "No key"}) is None
    assert lk.to_record({"key": "/works/OL1W", "title": " "}) is None
    many = lk.to_record({"key": "/works/OL2W", "title": "Anthology", "author_name": ["A", "B", "C", "D"], "cover_i": 7})
    assert many is not None and many.author == "A, B, C" and many.cover_id == "7"
