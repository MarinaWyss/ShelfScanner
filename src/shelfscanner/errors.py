"""Error kinds (009 task 3, moved here in 017 D5): the head of an error text, enough to group on
and safe to show.

A stored error is what an adapter or the catalogue said, verbatim: `http 429: rate
limited`, `truncated: hit max_tokens=4096`, `sdk: ConnectError: ... supabase.co ...`.
The weekly review groups on the head; the page shows the head and nothing more,
so a provider's message, a URL or a request id never reaches a visitor. The
full text stays in the row for the dashboard and the review.
"""

from __future__ import annotations

import re

# Words in an error's head and the kind they name, checked in order.
KINDS = (("truncat", "truncated"), ("parse", "parse"), ("invalid json", "parse"), ("config", "config"),
         ("transport", "transport"), ("sdk", "sdk"), ("timeout", "timeout"), ("no choices", "no choices"),
         ("no candidates", "no candidates"), ("stop_reason", "stop_reason"), ("refusal", "refusal"),
         ("prompt blocked", "prompt blocked"), ("spend", "spend cap"), ("model", "model"), ("provider", "provider"))
OTHER = "other"  # a head that names no kind: the text itself is never the kind (017 D5)


def error_kind(error: str) -> str:
    """The head of an error text, enough to group on: `http 429`, `truncated`, `parse`, `config`. A
    fixed vocabulary: an error that fits none is `other`, and its text stays in the row."""
    head = error.strip().split(":", 1)[0].strip().lower()
    m = re.match(r"((?:http|provider) \d{3})", head)
    if m:
        return m.group(1)
    for word, label in KINDS:
        if word in head:
            return label
    return OTHER
