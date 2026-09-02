"""Matching is pure and a wrong metric silently corrupts the comparison, so it is tested."""

import pytest

from shelfscanner.matching import normalise, score, similarity

T = 0.85


@pytest.mark.parametrize(
    "a, b",
    [
        ("The Hobbit", "Hobbit, The"),
        ("the hobbit", "The Hobbit"),
        ("Economics for Everyone: A Short Guide to the Economics of Capitalism", "Economics for Everyone"),
        ("This Is How You Lose the Time War", "This is how you lose the time war."),
        ("Götter und Heldensagen", "Gotter und Heldensagen"),
        ("Avatar: The Last Airbender – The Promise", "The Promise"),
        ("Avatar: The Last Airbender - The Rift", "The Rift"),
        ("American Gods", "AMERICAN GODS"),
        ("Neil Gaiman American Gods", "American Gods"),
        ("Stumbling on Happiness by Daniel Gilbert", "Stumbling on Happiness"),
    ],
)
def test_harmless_variance_matches(a, b):
    assert similarity(a, b) >= T


@pytest.mark.parametrize(
    "a, b",
    [
        ("Economics", "Economics for Everyone: A Short Guide"),  # fragment of the label: not accepted
        ("The Expanse", "Leviathan Wakes"),
        ("Awe and Wonder Collected Essays", "Awe"),  # one-word label inside a longer title: not accepted
    ],
)
def test_fragments_and_short_labels_do_not_match_by_containment(a, b):
    assert similarity(a, b) < T


@pytest.mark.parametrize(
    "a, b",
    [
        ("The Promise", "The Rift"),
        ("American Gods", "American Psycho"),
        ("Stumbling on Happiness", "Stumbling"),
        ("Leviathan Wakes", "Leviathan Falls"),
    ],
)
def test_different_titles_do_not_match(a, b):
    assert similarity(a, b) < T


def test_normalise_strips_punctuation_and_articles():
    assert normalise("The Book of Five Rings!") == "book of five rings"
    assert normalise("A Study in Scarlet") == "study in scarlet"
    assert normalise("Hobbit, The") == "hobbit"


def test_score_found_missed_invented():
    s = score(["American Gods", "The Hobbit", "Made Up Book"],
              ["American Gods", "The Creative Act", "Hobbit, The"], [], T)
    assert s.found == ["American Gods", "Hobbit, The"]
    assert s.missed == ["The Creative Act"]
    assert s.invented == ["Made Up Book"]
    assert s.recall == pytest.approx(2 / 3)


def test_partial_match_is_excluded_from_all_metrics():
    s = score(["The Search", "American Gods"], ["American Gods"], ["The Search"], T)
    assert s.found == ["American Gods"]
    assert s.missed == []
    assert s.invented == []
    assert s.partial_matched == ["The Search"]
    assert s.recall == 1.0


def test_label_counts_as_found_once():
    s = score(["American Gods", "American Gods"], ["American Gods"], [], T)
    assert s.found == ["American Gods"]
    assert s.invented == []
    assert s.duplicates == ["American Gods"]


def test_threshold_edge_is_inclusive():
    a, b = "abcdefghij", "abcdefghix"  # ratio exactly 0.9
    assert score([a], [b], [], 0.9).found == [b]
    assert score([a], [b], [], 0.91).invented == [a]


def test_empty_extraction_misses_everything():
    s = score([], ["A", "B"], [], T)
    assert s.missed == ["A", "B"] and s.recall == 0.0


def test_no_labels_gives_no_recall():
    assert score(["X"], [], [], T).recall is None
