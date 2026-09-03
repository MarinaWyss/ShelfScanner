"""Anthropic adapter: Claude via the official `anthropic` SDK (change 002, task 4).

Reads `ANTHROPIC_API_KEY` from `.env`. This module is the only place the SDK is imported (002 D2).
Details verified against the claude-api skill reference (cached 2026-06-24) on 2026-09-02:

- Model ids: Claude Sonnet 5 is `claude-sonnet-5`, Claude Haiku 4.5 is `claude-haiku-4-5`. No date suffixes.
- Reasoning: Sonnet 5 (and Opus 4.6+ / Sonnet 4.6) take `thinking={"type": "adaptive"}` plus
  `output_config={"effort": ...}`; `budget_tokens` is rejected. Haiku 4.5 (and the 4.5 / 3.x
  family) still take `thinking={"type": "enabled", "budget_tokens": N}` and reject `effort`.
- Structured output: `output_config={"format": {"type": "json_schema", "schema": ...}}`, every
  object with `additionalProperties: false`. Supported on Sonnet 5 and Haiku 4.5 (002 D3).
- Usage: `usage.output_tokens` includes thinking; `usage.output_tokens_details.thinking_tokens`
  reports how much. The request id is `response._request_id` (public despite the underscore).

How `model.reasoning_effort` maps to the API (002 D4):

    config value              adaptive models (Sonnet 5)                 budget models (Haiku 4.5)
    None (absent)             nothing sent: provider default             nothing sent: no thinking
                              (adaptive thinking, effort "high")
    "none"                    thinking disabled                          no thinking
    "minimal" / "low"         adaptive + effort "low"                    budget 1024 tokens
    "medium"                  adaptive + effort "medium"                 budget 4096 tokens
    "high" / "xhigh" / "max"  adaptive + effort as given                 budget 16384 tokens

A budget is capped at `max_tokens - 1024` so the reply keeps room, and dropped when even that
is under the API minimum of 1024. Unknown values are a config error and come back as a failed
result naming the value; nothing here raises for a model or transport failure.

Stop reasons: `end_turn` / `stop_sequence` become "stop"; `max_tokens` and
`model_context_window_exceeded` become "length" (so `parse_or_error` records truncation);
`refusal`, `tool_use` and `pause_turn` are kept verbatim and set `error`.
"""

from __future__ import annotations

import base64
import os
import time
from collections.abc import Callable
from typing import Any

import anthropic
from dotenv import load_dotenv

from shelfscanner.adapters.base import (
    DEFAULT_MAX_TOKENS,
    CallResult,
    cost_from_tokens,
    failed,
    parse_or_error,
)
from shelfscanner.config import Model
from shelfscanner.settings import REPO_ROOT

NAME = "anthropic"
PROVIDER = "Anthropic"
TIMEOUT_S = 180.0
API_KEY_VAR = "ANTHROPIC_API_KEY"

# Models that still take `thinking={"type": "enabled", "budget_tokens": N}` and reject `effort`.
# Everything else (Sonnet 5, Sonnet/Opus 4.6 and later) takes adaptive thinking plus effort.
BUDGET_MODEL_PREFIXES = ("claude-haiku-4-5", "claude-sonnet-4-5", "claude-opus-4-5", "claude-3")
ADAPTIVE_EFFORTS = ("low", "medium", "high", "xhigh", "max")
EFFORT_ALIASES = {"minimal": "low"}
THINKING_BUDGETS = {"low": 1024, "medium": 4096, "high": 16384, "xhigh": 16384, "max": 16384}
MIN_THINKING_BUDGET = 1024
REPLY_RESERVE = 1024

# Native structured output (002 D3). The `ModelClient` contract carries no schema, so the shapes
# the two prompts ask for today are fixed here per operation and can be overridden or switched off
# through the constructor. Every object needs `additionalProperties: false` for the API.
EXTRACTION_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "books": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "author": {"type": ["string", "null"]},
                },
                "required": ["title", "author"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["books"],
    "additionalProperties": False,
}
RECOMMENDATION_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "recommendations": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "reason": {"type": "string"},
                },
                "required": ["title", "reason"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["recommendations"],
    "additionalProperties": False,
}
DEFAULT_SCHEMAS: dict[str, dict[str, Any]] = {"vision": EXTRACTION_SCHEMA, "text": RECOMMENDATION_SCHEMA}

STOP_REASONS = {
    "end_turn": "stop",
    "stop_sequence": "stop",
    "max_tokens": "length",
    "model_context_window_exceeded": "length",
}


def api_key() -> str | None:
    load_dotenv(REPO_ROOT / ".env")
    return os.environ.get(API_KEY_VAR) or None


def is_budget_model(model_id: str) -> bool:
    return model_id.startswith(BUDGET_MODEL_PREFIXES)


def reasoning_params(model: Model, max_tokens: int) -> dict[str, Any]:
    """The `thinking` / `output_config.effort` arguments for `model.reasoning_effort` (see module doc).

    Raises ValueError for a value the mapping does not know; the caller turns that into a failed result.
    """
    effort = model.reasoning_effort
    if effort is None:
        return {}
    effort = EFFORT_ALIASES.get(effort, effort)
    if effort != "none" and effort not in ADAPTIVE_EFFORTS:
        raise ValueError(f"reasoning_effort={model.reasoning_effort!r} for {model.alias}: "
                         f"expected one of none, {', '.join(ADAPTIVE_EFFORTS)}")
    if is_budget_model(model.id_for_adapter):
        if effort == "none":
            return {}
        budget = min(THINKING_BUDGETS[effort], max_tokens - REPLY_RESERVE)
        if budget < MIN_THINKING_BUDGET:
            return {}
        return {"thinking": {"type": "enabled", "budget_tokens": budget}}
    if effort == "none":
        return {"thinking": {"type": "disabled"}}
    return {"thinking": {"type": "adaptive"}, "output_config": {"effort": effort}}


def normalise_stop(stop_reason: str | None) -> str | None:
    if stop_reason is None:
        return None
    return STOP_REASONS.get(stop_reason, stop_reason)


class AnthropicClient:
    """Implements `router.ModelClient`. Pass `client=` to inject a stub SDK client in tests."""

    def __init__(self, client: Any | None = None, schemas: dict[str, dict[str, Any]] | None = DEFAULT_SCHEMAS):
        self._client = client
        self._schemas = schemas or {}

    def vision(self, model: Model, prompt: str, image_jpeg: bytes, *, max_tokens: int = DEFAULT_MAX_TOKENS,
               on_progress: Callable[[str], None] | None = None, schema: dict[str, Any] | None = None) -> CallResult:
        return self._call(model, prompt, "vision", image_jpeg=image_jpeg, max_tokens=max_tokens,
                          on_progress=on_progress, schema=schema)

    def text(self, model: Model, prompt: str, input_text: str, *, max_tokens: int = DEFAULT_MAX_TOKENS,
             on_progress: Callable[[str], None] | None = None, schema: dict[str, Any] | None = None) -> CallResult:
        return self._call(model, prompt, "text", text=input_text, max_tokens=max_tokens, on_progress=on_progress,
                          schema=schema)

    def _sdk(self) -> Any:
        """The SDK client, built on first use so a missing key is reported per call, never at import."""
        if self._client is None:
            key = api_key()
            if key is None:
                raise LookupError(f"{API_KEY_VAR} missing: add it to .env (see .env.example)")
            self._client = anthropic.Anthropic(api_key=key, timeout=TIMEOUT_S)
        return self._client

    def build_request(self, model: Model, prompt: str, op: str, *, image_jpeg: bytes | None, text: str | None,
                      max_tokens: int, schema: dict[str, Any] | None = None) -> dict[str, Any]:
        content: list[dict[str, Any]] = []
        if image_jpeg is not None:
            content.append({"type": "image", "source": {
                "type": "base64", "media_type": "image/jpeg",
                "data": base64.standard_b64encode(image_jpeg).decode("ascii"),
            }})
        content.append({"type": "text", "text": prompt if text is None else f"{prompt}\n\n{text}"})
        request: dict[str, Any] = {
            "model": model.id_for_adapter,
            "max_tokens": max_tokens,
            "messages": [{"role": "user", "content": content}],
        }
        request.update(reasoning_params(model, max_tokens))
        schema = schema if schema is not None else self._schemas.get(op)
        if schema is not None:
            request.setdefault("output_config", {})["format"] = {"type": "json_schema", "schema": schema}
        return request

    def _call(self, model: Model, prompt: str, op: str, *, image_jpeg: bytes | None = None,
              text: str | None = None, max_tokens: int, on_progress: Callable[[str], None] | None,
              schema: dict[str, Any] | None = None) -> CallResult:
        model_id = model.id_for_adapter
        started = time.perf_counter()
        try:
            sdk = self._sdk()
            request = self.build_request(model, prompt, op, image_jpeg=image_jpeg, text=text, max_tokens=max_tokens,
                                     schema=schema)
        except (LookupError, ValueError) as e:
            return failed(model_id, NAME, started, f"config: {e}")

        if on_progress:
            on_progress(f"{NAME} {model_id}")
        started = time.perf_counter()
        try:
            response = sdk.messages.create(**request)
        except anthropic.APIStatusError as e:
            return failed(model_id, NAME, started, f"http {e.status_code}: {str(e.message)[:500]}")
        except anthropic.APIConnectionError as e:  # includes APITimeoutError
            return failed(model_id, NAME, started, f"transport: {e!r}")
        except anthropic.AnthropicError as e:
            return failed(model_id, NAME, started, f"sdk: {e!r}")
        latency_ms = int((time.perf_counter() - started) * 1000)

        usage = getattr(response, "usage", None)
        input_tokens = output_tokens = reasoning_tokens = None
        if usage is not None:
            # No caching is requested, so the cache counts are normally 0; summing them keeps the
            # count equal to the tokens actually sent if that ever changes.
            input_tokens = (usage.input_tokens + (getattr(usage, "cache_creation_input_tokens", None) or 0)
                            + (getattr(usage, "cache_read_input_tokens", None) or 0))
            output_tokens = usage.output_tokens
            details = getattr(usage, "output_tokens_details", None)
            reasoning_tokens = getattr(details, "thinking_tokens", None) if details is not None else None
        request_id = getattr(response, "_request_id", None)
        finish_reason = normalise_stop(getattr(response, "stop_reason", None))
        cost = cost_from_tokens(model, input_tokens, output_tokens)

        raw_text = "".join(b.text for b in response.content if getattr(b, "type", None) == "text") or None
        if finish_reason not in ("stop", "length"):
            error = f"stop_reason {finish_reason!r}"
            if finish_reason == "refusal" and getattr(response, "stop_details", None) is not None:
                error += f": {response.stop_details.category} {response.stop_details.explanation}"
            parsed = None
        elif raw_text is None and finish_reason == "length":
            parsed, error = parse_or_error("", finish_reason, max_tokens, reasoning_tokens)  # thinking ate the budget
        elif raw_text is None:
            parsed, error = None, f"no text block in response (blocks: {[getattr(b, 'type', '?') for b in response.content]})"
        else:
            parsed, error = parse_or_error(raw_text, finish_reason, max_tokens, reasoning_tokens)

        return CallResult(
            model=model_id, provider=PROVIDER, raw_text=raw_text, parsed=parsed,
            input_tokens=input_tokens, output_tokens=output_tokens, cost_usd=cost,
            latency_ms=latency_ms, error=error, finish_reason=finish_reason,
            reasoning_tokens=reasoning_tokens, request_id=request_id, adapter=NAME,
        )
