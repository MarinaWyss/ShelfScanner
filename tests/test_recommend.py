"""D5 validity checks are pure and decide the pass/fail, so they are tested."""

from shelfscanner.recommend import Recommendation as R
from shelfscanner.recommend import check, recs_from, shelf_text

T = 0.85
EXTRACTED = ["American Gods", "The Alchemist", "Stumbling on Happiness", "Economics for Everyone"]
LABELS = ["American Gods", "Stumbling on Happiness", "Economics for Everyone: A Short Guide"]


def test_all_on_list_and_in_labels():
    v = check([R("American Gods", ""), R("Stumbling on Happiness", "")], EXTRACTED, LABELS, T)
    assert (v.vs_extraction, v.vs_ground_truth, v.off_list) == (2, 2, [])


def test_hallucinated_extraction_is_valid_vs_extraction_but_not_labels():
    v = check([R("The Alchemist", "")], EXTRACTED, LABELS, T)
    assert (v.vs_extraction, v.vs_ground_truth) == (1, 0)


def test_off_list_title_is_counted_and_named():
    v = check([R("Dune", ""), R("American Gods", "")], EXTRACTED, LABELS, T)
    assert v.vs_extraction == 1
    assert v.off_list == ["Dune"]


def test_minor_reformatting_still_counts():
    v = check([R("american gods", ""), R("Economics for Everyone: A Short Guide", "")], EXTRACTED, LABELS, T)
    assert v.vs_extraction == 2


def test_recs_from_tolerates_shapes():
    assert recs_from({"recommendations": [{"title": "A", "reason": "r"}, {"nope": 1}]}) == [R("A", "r")]
    assert recs_from([{"title": "B"}]) == [R("B", "")]
    assert recs_from("garbage") == []


def test_shelf_text_includes_author_when_present():
    txt = shelf_text({"books": [{"title": "A", "author": "X"}, {"title": "B", "author": None}]})
    assert txt == "- A — X\n- B"


def test_v3_puts_the_shelf_after_the_preferences():
    """004 task 4: GPT-5.4 mini ignored the shelf-only rule when a long preferences block followed the shelf."""
    from shelfscanner.recommend import input_text

    prefs = {"genres": ["science fiction"], "free_text": "", "rated_books": [], "to_read": [], "avoid": []}
    v2 = input_text("- Dune", prefs, "recommend_v2")
    v3 = input_text("- Dune", prefs, "recommend_v3")
    assert v2.startswith("Books on the shelf:") and v2.index("Reading preferences:") > v2.index("Dune")
    assert v3.startswith("Reading preferences:") and v3.endswith("(the only books you may recommend):\n- Dune")
