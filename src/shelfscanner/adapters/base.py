"""Shared pieces for adapters: the result shape, JSON parsing, cost from tokens."""

from __future__ import annotations

import json
import re
import time
from dataclasses import dataclass
from typing import Any

from shelfscanner.config import Model

# 8192, not 4096: on a dense shelf Sonnet 5 spent 3,400 reasoning tokens inside a 4,096 cap and
# truncated before the JSON (006, sourced photo wm_bookshelf_13). Reasoning counts against the cap
# on every direct adapter; the cap is a ceiling on spend, not a target.
DEFAULT_MAX_TOKENS = 8192

# The two reply shapes the prompts ask for, as JSON Schema, passed to adapters that support
# native structured output (002 D3). Strict everywhere: no extra keys, every key required, so
# the same schema is accepted by OpenAI strict mode, Anthropic and Gemini.
BOOKS_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "books": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"title": {"type": "string"}, "author": {"type": ["string", "null"]}},
                "required": ["title", "author"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["books"],
    "additionalProperties": False,
}
RECOMMENDATIONS_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "recommendations": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"title": {"type": "string"}, "reason": {"type": "string"}},
                "required": ["title", "reason"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["recommendations"],
    "additionalProperties": False,
}
_FENCE = re.compile(r"^\s*```(?:json)?\s*(.*?)\s*```\s*$", re.DOTALL)


@dataclass(frozen=True)
class CallResult:
    """What every adapter returns, and what every logged row is built from (change 002)."""

    model: str  # the id the adapter sent: OpenRouter slug or the provider's own model id
    provider: str | None  # who actually served it
    raw_text: str | None
    parsed: Any  # decoded JSON, or None when parsing failed or the call errored
    input_tokens: int | None
    output_tokens: int | None
    cost_usd: float | None
    latency_ms: int
    error: str | None
    finish_reason: str | None = None  # "stop", "length", ... normalised to those two where possible
    reasoning_tokens: int | None = None  # counted inside output_tokens
    request_id: str | None = None  # the provider's request id, for support tickets
    adapter: str | None = None  # which adapter produced this

    @property
    def ok(self) -> bool:
        return self.error is None

    @property
    def truncated(self) -> bool:
        return self.finish_reason == "length"


def parse_json(text: str) -> Any:
    """Decode a JSON object from a model reply, tolerating a code fence around it."""
    m = _FENCE.match(text)
    candidate = m.group(1) if m else text
    try:
        return json.loads(candidate)
    except json.JSONDecodeError:
        start, end = candidate.find("{"), candidate.rfind("}")
        if start == -1 or end <= start:
            raise
        return json.loads(candidate[start : end + 1])


def parse_or_error(raw_text: str | None, finish_reason: str | None, max_tokens: int,
                   reasoning_tokens: int | None) -> tuple[Any, str | None]:
    """Parse the reply; a cut-off reply is reported as truncation, not as a parse failure (001 D9)."""
    try:
        return parse_json(raw_text or ""), None
    except json.JSONDecodeError as e:
        if finish_reason == "length":
            return None, f"truncated: hit max_tokens={max_tokens} (reasoning_tokens={reasoning_tokens})"
        return None, f"json parse: {e}"


def cost_from_tokens(model: Model, input_tokens: int | None, output_tokens: int | None) -> float | None:
    """Tokens times the config prices, reasoning priced as output (change 002, D5)."""
    if input_tokens is None or output_tokens is None:
        return None
    return (input_tokens * model.price_input + output_tokens * model.price_output) / 1_000_000


def failed(model_id: str, adapter: str, started: float, error: str) -> CallResult:
    return CallResult(model_id, None, None, None, None, None, None,
                      int((time.perf_counter() - started) * 1000), error, adapter=adapter)
