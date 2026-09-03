"""Title matching and extraction metrics (proposal D3, D4).

Pure functions, no I/O. The threshold comes from config, not from here.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from difflib import SequenceMatcher

_ARTICLES = ("the", "a", "an")
_SPLIT = re.compile(r"\s*[:–—\-]\s+|\s*:\s*")  # colon, or a spaced dash


def normalise(title: str) -> str:
    """Lowercase, strip accents and punctuation, collapse whitespace, drop a leading or trailing article."""
    t = unicodedata.normalize("NFKD", title)
    t = "".join(c for c in t if not unicodedata.combining(c)).lower()
    t = re.sub(r"[^\w\s]", " ", t)
    words = t.split()
    if words and words[0] in _ARTICLES:
        words = words[1:]
    if len(words) > 1 and words[-1] in _ARTICLES:  # "Hobbit, The"
        words = words[:-1]
    return " ".join(words)


def forms(title: str) -> list[str]:
    """Normalised variants to compare: the whole title, the part before a colon
    (D3's "drop the subtitle"), and the part after the last colon or dash (a
    series volume written as "Series: Volume")."""
    whole = normalise(title)
    out = [whole]
    parts = [p for p in _SPLIT.split(title) if p.strip()]
    if len(parts) > 1:
        out.append(normalise(parts[0]))
        out.append(normalise(parts[-1]))
    return [f for i, f in enumerate(out) if f and f not in out[:i]]


_MIN_CONTAINED_WORDS = 2


def similarity(extracted: str, label: str) -> float:
    """Best sequence ratio across the variant forms of both titles.

    Also 1.0 when a form of the label appears whole inside the extracted title
    and is at least two words long: models sometimes put the author into the
    title field ("Neil Gaiman American Gods"), which is a format slip, not a
    reading error. The reverse (a fragment of the label) is not accepted.
    """
    ef, lf = forms(extracted), forms(label)
    if not ef or not lf:  # a title with no letters or digits ("...", "—") matches nothing
        return 0.0
    best = max(SequenceMatcher(None, x, y).ratio() for x in ef for y in lf)
    if best < 1.0:
        for y in lf:
            if len(y.split()) >= _MIN_CONTAINED_WORDS and any(f" {y} " in f" {x} " for x in ef):
                return 1.0
    return best


@dataclass(frozen=True)
class Scored:
    found: list[str]  # label titles that an extracted title matched
    missed: list[str]  # label titles nothing matched
    invented: list[str]  # extracted titles matching no label, full or partial
    partial_matched: list[str]  # extracted titles matching a partial label; excluded from metrics (D4)
    duplicates: list[str] = field(default_factory=list)  # extracted titles matching an already-found label

    @property
    def recall(self) -> float | None:
        total = len(self.found) + len(self.missed)
        return len(self.found) / total if total else None


def score(extracted: list[str], titles: list[str], partial: list[str], threshold: float) -> Scored:
    """Match each extracted title to its best label. A label counts as found once."""
    remaining = list(titles)
    found: list[str] = []
    invented: list[str] = []
    partial_matched: list[str] = []
    duplicates: list[str] = []

    for ex in extracted:
        if not ex or not ex.strip():
            continue
        best, best_ratio = None, 0.0
        for label in remaining:
            r = similarity(ex, label)
            if r > best_ratio:
                best, best_ratio = label, r
        if best is not None and best_ratio >= threshold:
            found.append(best)
            remaining.remove(best)
            continue
        if any(similarity(ex, t) >= threshold for t in titles if t not in remaining):
            duplicates.append(ex)
            continue
        if any(similarity(ex, p) >= threshold for p in partial):
            partial_matched.append(ex)
            continue
        invented.append(ex)

    return Scored(found=found, missed=remaining, invented=invented,
                  partial_matched=partial_matched, duplicates=duplicates)
