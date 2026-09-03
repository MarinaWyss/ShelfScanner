"""Google adapter: Gemini via the official `google-genai` SDK (change 002, task 2).

The only module that imports the SDK (002 D2). Structured output is native (D3): every call
asks for `application/json`, and a JSON schema is attached when the client was built with one.
Reasoning comes from config (D4) through the SDK's thinking level. Cost is tokens times the
config prices, thinking tokens priced as output (D5).

Reasoning-effort mapping (`Model.reasoning_effort` -> `ThinkingConfig.thinking_level`):

    None (unset in config)  -> no thinking_config; the model's own default
    "none" or "minimal"     -> MINIMAL
    "low"                   -> LOW
    "medium"                -> MEDIUM
    "high"                  -> HIGH

Gemini 3.5 and later reject the older `thinking_budget` (the SDK's own docstring says so), and
a Gemini 3 Flash cannot switch thinking off entirely, so "none" is the lowest level rather than a
zero budget. Any other value is a config error and stops the run.
"""

from __future__ import annotations

import os
import time
from collections.abc import Callable
from typing import Any

import httpx
from dotenv import load_dotenv
from google import genai
from google.genai import errors, types

from shelfscanner.adapters.base import (
    DEFAULT_MAX_TOKENS,
    CallResult,
    cost_from_tokens,
    failed,
    parse_or_error,
)
from shelfscanner.config import Model
from shelfscanner.settings import REPO_ROOT

NAME = "google"
PROVIDER = "Google"
API_KEY_ENV = "GEMINI_API_KEY"
TIMEOUT_MS = 180_000
# One retry inside the SDK on 408/429/5xx; anything past that is the router's failover (D8).
RETRY_ATTEMPTS = 2

THINKING_LEVELS: dict[str, types.ThinkingLevel] = {
    "none": types.ThinkingLevel.MINIMAL,
    "minimal": types.ThinkingLevel.MINIMAL,
    "low": types.ThinkingLevel.LOW,
    "medium": types.ThinkingLevel.MEDIUM,
    "high": types.ThinkingLevel.HIGH,
}

# The reply shapes the two prompts ask for, as JSON Schema for `response_json_schema`. Pass one to
# `GoogleClient(schema=...)`; the adapter does not guess which prompt it was handed.
BOOKS_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "books": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"title": {"type": "string"}, "author": {"type": ["string", "null"]}},
                "required": ["title", "author"],
            },
        }
    },
    "required": ["books"],
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
            },
        }
    },
    "required": ["recommendations"],
}

_FINISH_REASONS = {"STOP": "stop", "MAX_TOKENS": "length"}


def thinking_config(reasoning_effort: str | None) -> types.ThinkingConfig | None:
    """Config's reasoning setting as the SDK's thinking control; see the module docstring."""
    if reasoning_effort is None:
        return None
    try:
        level = THINKING_LEVELS[reasoning_effort.lower()]
    except KeyError:
        raise SystemExit(
            f"reasoning_effort {reasoning_effort!r} is not one for the google adapter. "
            f"Known: {', '.join(THINKING_LEVELS)}"
        ) from None
    return types.ThinkingConfig(thinking_level=level)


def normalise_finish_reason(reason: types.FinishReason | str | None) -> str | None:
    """STOP -> "stop", MAX_TOKENS -> "length", anything else lower-cased (e.g. "safety")."""
    if reason is None:
        return None
    raw = reason.value if isinstance(reason, types.FinishReason) else str(reason)
    return _FINISH_REASONS.get(raw, raw.lower())


def api_key() -> str | None:
    load_dotenv(REPO_ROOT / ".env")
    return os.environ.get(API_KEY_ENV) or None


class GoogleClient:
    """`ModelClient` for Gemini. `schema` is a JSON Schema for the reply, attached to every call;
    with none, the call still asks for JSON but leaves the shape to the prompt. `client` injects
    a stub SDK client in tests; otherwise one is built from `GEMINI_API_KEY` on first use."""

    def __init__(self, schema: dict[str, Any] | None = None, *, client: Any | None = None):
        self.schema = schema
        self._client = client

    def vision(self, model: Model, prompt: str, image_jpeg: bytes, *, max_tokens: int = DEFAULT_MAX_TOKENS,
               on_progress: Callable[[str], None] | None = None) -> CallResult:
        contents = [types.Part.from_bytes(data=image_jpeg, mime_type="image/jpeg"), prompt]
        return self._call(model, contents, max_tokens=max_tokens, on_progress=on_progress)

    def text(self, model: Model, prompt: str, input_text: str, *, max_tokens: int = DEFAULT_MAX_TOKENS,
             on_progress: Callable[[str], None] | None = None) -> CallResult:
        return self._call(model, f"{prompt}\n\n{input_text}", max_tokens=max_tokens, on_progress=on_progress)

    def _sdk(self) -> Any:
        if self._client is None:
            key = api_key()
            if key is None:
                raise _MissingKey()
            self._client = genai.Client(
                api_key=key,
                http_options=types.HttpOptions(
                    timeout=TIMEOUT_MS, retry_options=types.HttpRetryOptions(attempts=RETRY_ATTEMPTS)
                ),
            )
        return self._client

    def _config(self, model: Model, max_tokens: int) -> types.GenerateContentConfig:
        return types.GenerateContentConfig(
            max_output_tokens=max_tokens,
            response_mime_type="application/json",
            response_json_schema=self.schema,
            thinking_config=thinking_config(model.reasoning_effort),
        )

    def _call(self, model: Model, contents: Any, *, max_tokens: int,
              on_progress: Callable[[str], None] | None) -> CallResult:
        model_id = model.id_for_adapter
        config = self._config(model, max_tokens)
        if on_progress:
            on_progress(f"{NAME}: {model_id}")

        started = time.perf_counter()
        try:
            response = self._sdk().models.generate_content(model=model_id, contents=contents, config=config)
        except _MissingKey:
            return failed(model_id, NAME, started, f"{API_KEY_ENV} is not set: add it to .env (see .env.example)")
        except errors.APIError as e:
            return failed(model_id, NAME, started, f"http {e.code} {e.status}: {str(e.message)[:500]}")
        except httpx.HTTPError as e:
            return failed(model_id, NAME, started, f"transport: {e!r}")
        except Exception as e:  # noqa: BLE001 - the contract is never to raise for a provider failure
            return failed(model_id, NAME, started, f"sdk: {type(e).__name__}: {str(e)[:500]}")
        latency_ms = int((time.perf_counter() - started) * 1000)

        return self._map(model, model_id, response, max_tokens, latency_ms)

    @staticmethod
    def _map(model: Model, model_id: str, response: types.GenerateContentResponse, max_tokens: int,
             latency_ms: int) -> CallResult:
        usage = response.usage_metadata
        input_tokens = usage.prompt_token_count if usage else None
        reasoning_tokens = usage.thoughts_token_count if usage else None
        answer_tokens = usage.candidates_token_count if usage else None
        output_tokens = None if answer_tokens is None else answer_tokens + (reasoning_tokens or 0)
        cost = cost_from_tokens(model, input_tokens, output_tokens)
        request_id = response.response_id

        candidate = response.candidates[0] if response.candidates else None
        if candidate is None:
            feedback = response.prompt_feedback
            why = f"prompt blocked: {feedback.block_reason}" if feedback and feedback.block_reason else "no candidates"
            return CallResult(model_id, PROVIDER, None, None, input_tokens, output_tokens, cost, latency_ms, why,
                              reasoning_tokens=reasoning_tokens, request_id=request_id, adapter=NAME)

        finish_reason = normalise_finish_reason(candidate.finish_reason)
        raw_text = response.text
        parsed, error = parse_or_error(raw_text, finish_reason, max_tokens, reasoning_tokens)
        return CallResult(
            model=model_id, provider=PROVIDER, raw_text=raw_text, parsed=parsed,
            input_tokens=input_tokens, output_tokens=output_tokens, cost_usd=cost,
            latency_ms=latency_ms, error=error, finish_reason=finish_reason,
            reasoning_tokens=reasoning_tokens, request_id=request_id, adapter=NAME,
        )


class _MissingKey(Exception):
    """Raised inside `_sdk()` and turned into a failed `CallResult` so failover (D8) can act on it."""
