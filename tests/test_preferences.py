"""Change 004: the importer is pure over a CSV, so it is tested on an anonymised fixture."""

import argparse
import json
from pathlib import Path

from shelfscanner import preferences as p
from shelfscanner.recommend import prefs_text

FIXTURE = Path("tests/fixtures/goodreads_sample.csv")
FLAT = {"genres": ["science fiction"], "likes": "Big ideas.", "loved_books": ["Three Body Problem"], "avoid": ["doorstops"],
        "_note": "ignored"}


def rows():
    return p.read_export(FIXTURE)


def titles(books):
    return [b["title"] for b in books]


def test_reads_every_row_and_shelves():
    rs = rows()
    assert len(rs) == 30
    shelves = {s: sum(1 for r in rs if r.shelf == s) for s in ("read", "to-read", "currently-reading", "did-not-finish")}
    assert shelves == {"read": 20, "to-read": 7, "currently-reading": 1, "did-not-finish": 2}


def test_ratings_parse_in_both_goodreads_forms_and_empty_is_unrated():
    by_title = {r.title: r.rating for r in rows()}
    assert by_title["The Salt Road"] == 5  # "5.0"
    assert by_title["Thirteen Ways of Looking at a Kitchen"] == 5  # "5"
    assert by_title["Half-Life"] == 4
    assert by_title["Clockwork Sparrow"] == 0  # "0"
    assert by_title["Glass Harvest"] == 0  # empty cell


def test_awkward_titles_and_authors_survive():
    by_title = {r.title: r for r in rows()}
    assert "Hello, World, Goodbye" in by_title
    assert 'The "Honest" Liar' in by_title
    assert "Quiet Machines: How Small Habits Run Large Lives" in by_title
    assert by_title["The Cartographer's Daughter"].author == "Lena Søndergaard"
    assert by_title["Ash & Ember (Cinder Court, #1)"].author == "Zoë Brändli"  # double space collapsed
    assert by_title["Nightjar"].author == "Elif Yıldız"


def test_dates_parse_and_missing_date_read_is_none():
    by_title = {r.title: r for r in rows()}
    assert str(by_title["The Salt Road"].date_read) == "2026-08-10"
    assert by_title["The Weight of Small Things"].date_read is None
    assert str(by_title["The Weight of Small Things"].date_added) == "2024-01-10"


def test_build_follows_d1():
    prefs = p.build(rows())
    assert set(prefs) == set(p.KEYS)
    assert len(prefs["rated_books"]) == 18  # 20 read minus 2 unrated
    assert len(prefs["to_read"]) == 7
    assert {b["rating"] for b in prefs["rated_books"]} == {1, 2, 3, 4, 5}
    assert "The Algebra of Bees" not in titles(prefs["rated_books"]) + titles(prefs["to_read"])  # currently-reading
    assert prefs["avoid"] == ["Vantage — Theo Bright (did not finish)", "Seven Tongues — Ilse Vermeulen (did not finish)"]
    assert "Seven Tongues" not in titles(prefs["rated_books"])  # rated, but did-not-finish wins
    assert prefs["rated_books"][0] == {"title": "The Salt Road", "author": "Imogen Farrow", "rating": 5}


def test_rated_books_are_ordered_highest_then_most_recent():
    got = prefs = p.build(rows())["rated_books"]
    ratings = [b["rating"] for b in got]
    assert ratings == sorted(ratings, reverse=True)
    fives = titles([b for b in prefs if b["rating"] == 5])
    assert fives[:3] == ["The Salt Road", "Hello, World, Goodbye", "Smoke & Signal (Cinder Court, #2)"]
    fours = titles([b for b in prefs if b["rating"] == 4])
    assert fours[-1] == "The Weight of Small Things"  # no date read: falls back to date added, the oldest


def test_to_read_is_most_recently_added_first():
    got = titles(p.build(rows())["to_read"])
    assert got[:3] == ["The Last Lighthouse Keeper", "Fermentation for the Impatient", "Signal and Noise: A Short History of Listening"]
    assert got[-1] == "Slow Rivers"


def test_cap_keeps_dislikes_then_strongest_likes_most_recent_first():
    prefs = p.build(rows(), max_rated=6, max_to_read=3)
    assert titles(prefs["rated_books"]) == [
        "The Salt Road", "Hello, World, Goodbye", "Smoke & Signal (Cinder Court, #2)",  # the three most recent 5s
        "A Field Guide to Losing Things", "Sunk Cost",  # the 2s
        "Ninety Days of Static",  # the 1
    ]
    assert titles(prefs["to_read"]) == ["The Last Lighthouse Keeper", "Fermentation for the Impatient",
                                        "Signal and Noise: A Short History of Listening"]


def test_default_caps_are_d2():
    assert (p.MAX_RATED, p.MAX_TO_READ) == (60, 20)
    many = {"rated_books": [{"title": str(i), "author": None, "rating": 5} for i in range(100)]
            + [{"title": "bad", "author": None, "rating": 1}],
            "to_read": [{"title": str(i), "author": None} for i in range(50)]}
    capped = p.cap(many)
    assert len(capped["rated_books"]) == 60 and len(capped["to_read"]) == 20
    assert "bad" in titles(capped["rated_books"])  # a dislike survives the cap even when listed last


def test_upgrade_converts_the_flat_shape():
    up = p.upgrade(FLAT)
    assert up == {"genres": ["science fiction"], "free_text": "Big ideas.",
                  "rated_books": [{"title": "Three Body Problem", "author": None, "rating": 5}], "to_read": [], "avoid": ["doorstops"]}
    assert p.upgrade(up) == up
    assert p.upgrade({"genres": ["x"], "to_read": []})["rated_books"] == []  # partial v2 object gets the missing keys


def test_is_v2():
    assert not p.is_v2(FLAT)
    assert p.is_v2(p.empty())


def test_import_export_merges_base_and_flags(tmp_path):
    base = tmp_path / "base.json"
    base.write_text(json.dumps(FLAT))
    prefs = p.import_export(FIXTURE, base=p.load_file(base), genres=["fantasy"], avoid=["long series"])
    assert prefs["genres"] == ["science fiction", "fantasy"]
    assert prefs["free_text"] == "Big ideas."
    assert prefs["avoid"][:2] == ["doorstops", "long series"] and len(prefs["avoid"]) == 4
    assert "Three Body Problem" not in titles(prefs["rated_books"])  # base's loved_books do not carry over; the export is the history


def test_as_text_is_compact_and_omits_empty_sections():
    txt = p.as_text({"genres": ["sf"], "free_text": " Voice matters. ", "rated_books": [{"title": "A", "author": "X", "rating": 5},
                                                                                        {"title": "B", "author": None, "rating": 1}],
                     "to_read": [{"title": "C", "author": "Y"}], "avoid": []})
    assert txt == ("Genres: sf\nAbout the reader: Voice matters.\nRated books, 1 (disliked) to 5 (loved):\n"
                   "- A — X (5/5)\n- B (1/5)\nWants to read:\n- C — Y")
    assert p.as_text(p.empty()) == "(no preferences given)"


def test_prefs_text_keeps_v1_behaviour_for_the_flat_shape():
    flat = {k: v for k, v in FLAT.items() if k != "_note"}
    assert prefs_text(flat, "recommend_v1") == json.dumps(flat, indent=2, ensure_ascii=False)
    assert prefs_text(flat, "recommend_v2") == p.as_text(p.upgrade(flat))  # upgraded for v2
    v2 = p.build(rows())
    assert prefs_text(v2, "recommend_v1") == p.as_text(v2)  # a structured object is laid out whatever the prompt


def test_not_an_export_fails_clearly(tmp_path):
    bad = tmp_path / "x.csv"
    bad.write_text("Title,Author\nA,B\n")
    try:
        p.read_export(bad)
    except SystemExit as e:
        assert "not a Goodreads export" in str(e)
    else:
        raise AssertionError("expected SystemExit")


def test_import_command_writes_a_file(tmp_path, capsys):
    parser = argparse.ArgumentParser()
    p.add_parser(parser.add_subparsers(dest="command", required=True))
    out = tmp_path / "me.json"
    args = parser.parse_args(["prefs", "import", "--csv", str(FIXTURE), "--genres", "fantasy", "history", "--out", str(out)])
    args.func(args)
    written = json.loads(out.read_text())
    assert written["genres"] == ["fantasy", "history"]
    assert len(written["rated_books"]) == 18
    assert "18 rated books, 7 to read, 2 avoid entries, 2 genres" in capsys.readouterr().out
