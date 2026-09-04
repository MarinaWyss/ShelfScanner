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

# How an error's head starts and the kind it names, checked in order. The heads are what the adapters
# write (`adapters/*.py`, `router.parse_or_error`), what `router.FAILOVER_ERROR_PREFIXES` decides
# failover on, and the two sentences the pipeline writes itself (`expected N recommendations, got M`
# in `recommend.py`, `Spend cap reached` in `spend.py`).
KINDS = (("truncat", "truncated"), ("parse", "parse"), ("invalid json", "parse"), ("config", "config"),
         ("transport", "transport"), ("sdk", "sdk"), ("timeout", "timeout"), ("no choices", "no choices"),
         ("no candidates", "no candidates"), ("stop_reason", "stop_reason"), ("refusal", "refusal"),
         ("prompt blocked", "prompt blocked"), ("spend", "spend cap"), ("model", "model"), ("provider", "provider"),
         ("expected ", "wrong count"), ("gemini_api_key", "config"), ("openai_api_key", "config"),
         ("anthropic_api_key", "config"))
OTHER = "other"  # a head that names no kind: the text itself is never the kind (017 D5)


def error_kind(error: str) -> str:
    """The kind an error text's head names: `http 429`, `truncated`, `parse`, `config`, `wrong count`.
    A fixed vocabulary matched on how the head starts; an error that fits none is `other`, and its
    text stays in the row."""
    head = error.strip().split(":", 1)[0].strip().lower()
    m = re.match(r"((?:http|provider) \d{3})", head)
    if m:
        return m.group(1)
    for prefix, label in KINDS:
        if head.startswith(prefix):
            return label
    return OTHER
