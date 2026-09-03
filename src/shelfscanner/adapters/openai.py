"""OpenAI adapter: GPT-5.x through the official SDK's Responses API (change 002, task 3).

Why the Responses API and not Chat Completions: it is the surface OpenAI documents for the
GPT-5 family (the reasoning and structured-output guides are written against it, and from
GPT-5.4 Chat Completions no longer supports reasoning effort with tools). It also reports
truncation explicitly (`incomplete_details.reason == "max_output_tokens"`) instead of a
`finish_reason` that needs interpreting, and its `output_text` helper flattens the reply.

What is sent, per call:

- `model`: `model.id_for_adapter`, the provider's own id from config (`model_id`).
- `input`: one user message; for `vision` an `input_image` carrying the JPEG as a data URL
  followed by the prompt as `input_text`; for `text` the prompt and the input joined by a
  blank line, the same as the OpenRouter adapter so rows stay comparable with change 001.
- `max_output_tokens`: the caller's `max_tokens`. OpenAI counts reasoning tokens inside
  this cap, so a reply that spends the budget thinking is reported as truncation.
- `reasoning.effort`: `model.reasoning_effort` passed through unchanged. Config values are
  the SDK's own vocabulary (`none`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`);
  `None` in config omits the parameter, leaving the model's default. A value the model does
  not accept (GPT-5.4 mini takes none/low/medium/high/xhigh) comes back as a 400 and is
  returned as an error result, never raised.
- `text.format`: structured output (D3). `{"type": "json_object"}` by default, which only
  guarantees valid JSON; pass `schema=` to the constructor for a strict `json_schema`.
- `store=False`: shelf photos may show private rooms; nothing is kept on OpenAI's side.

Cost is computed from the usage block with the config prices (D5). The Responses API's
`usage.output_tokens` already includes reasoning tokens, so reasoning is priced as output
without any adjustment; `reasoning_tokens` is filled from `output_tokens_details`.

The key is `OPENAI_API_KEY`, read from the environment after loading the project's .env.
A missing key is returned as an error result on the first call rather than raised, so the
router's failover (task 5) can treat it like any other provider outage.
"""

from __future__ import annotations

import base64
import os
import time
from collections.abc import Callable
from dataclasses import replace
from typing import Any

import openai
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

NAME = "openai"
PROVIDER = "OpenAI"
KEY_ENV = "OPENAI_API_KEY"
TIMEOUT_S = 180.0
IMAGE_DETAIL = "auto"  # the OpenRouter path sent no detail level, so the comparison stays like for like

# What the Responses API reports -> the two values the pipeline understands (base.CallResult).
_FINISH_BY_INCOMPLETE_REASON = {"max_output_tokens": "length"}


class OpenAIClient:
    """Implements `shelfscanner.router.ModelClient` over `openai.OpenAI().responses.create`.

    `schema` is a JSON Schema dict for strict structured output; without it the adapter asks
    for JSON mode. `client` injects a fake in tests (anything with `.responses.create`).
    """

    def __init__(self, schema: dict[str, Any] | None = None, *, schema_name: str = "reply",
                 client: Any | None = None) -> None:
        self._schema = schema
        self._schema_name = schema_name
        self._client = client

    # -- the protocol ---------------------------------------------------------------------

    def vision(self, model: Model, prompt: str, image_jpeg: bytes, *, max_tokens: int = DEFAULT_MAX_TOKENS,
               on_progress: Callable[[str], None] | None = None) -> CallResult:
        return self._call(model, prompt, image_jpeg=image_jpeg, max_tokens=max_tokens, on_progress=on_progress)

    def text(self, model: Model, prompt: str, input_text: str, *, max_tokens: int = DEFAULT_MAX_TOKENS,
             on_progress: Callable[[str], None] | None = None) -> CallResult:
        return self._call(model, prompt, text=input_text, max_tokens=max_tokens, on_progress=on_progress)

    # -- request ---------------------------------------------------------------------------

    def build_request(self, model: Model, prompt: str, *, image_jpeg: bytes | None = None,
                      text: str | None = None, max_tokens: int) -> dict[str, Any]:
        """The keyword arguments for `responses.create`. Separate so tests can check them."""
        content: list[dict[str, Any]] = []
        if image_jpeg is not None:
            b64 = base64.b64encode(image_jpeg).decode("ascii")
            content.append({"type": "input_image", "detail": IMAGE_DETAIL,
                            "image_url": f"data:image/jpeg;base64,{b64}"})
        content.append({"type": "input_text", "text": prompt if text is None else f"{prompt}\n\n{text}"})

        request: dict[str, Any] = {
            "model": model.id_for_adapter,
            "input": [{"role": "user", "content": content}],
            "max_output_tokens": max_tokens,
            "text": {"format": self._text_format()},
            "store": False,
        }
        if model.reasoning_effort:
            request["reasoning"] = {"effort": model.reasoning_effort}
        return request

    def _text_format(self) -> dict[str, Any]:
        if self._schema is None:
            return {"type": "json_object"}
        return {"type": "json_schema", "name": self._schema_name, "schema": self._schema, "strict": True}

    # -- call and response -----------------------------------------------------------------

    def _sdk_client(self) -> Any | None:
        """The SDK client, built on first use so a missing key is a result, not an import-time crash."""
        if self._client is None:
            load_dotenv(REPO_ROOT / ".env")
            key = os.environ.get(KEY_ENV)
            if not key:
                return None
            self._client = openai.OpenAI(api_key=key, timeout=TIMEOUT_S)
        return self._client

    def _call(self, model: Model, prompt: str, *, image_jpeg: bytes | None = None, text: str | None = None,
              max_tokens: int, on_progress: Callable[[str], None] | None) -> CallResult:
        model_id = model.id_for_adapter
        started = time.perf_counter()
        client = self._sdk_client()
        if client is None:
            return failed(model_id, NAME, started,
                          f"config: {KEY_ENV} is not set; add it to .env (see .env.example)")
        request = self.build_request(model, prompt, image_jpeg=image_jpeg, text=text, max_tokens=max_tokens)

        if on_progress:
            on_progress(f"{NAME}: calling {model_id}")
        try:
            response = client.responses.create(**request)
        except openai.APIStatusError as e:
            return replace(failed(model_id, NAME, started, f"http {e.status_code}: {e.message[:500]}"),
                           request_id=e.request_id)
        except openai.APIConnectionError as e:  # includes APITimeoutError
            return failed(model_id, NAME, started, f"transport: {e.message}")
        except openai.OpenAIError as e:
            return failed(model_id, NAME, started, f"sdk: {e!r}"[:500])
        latency_ms = int((time.perf_counter() - started) * 1000)

        return self.map_response(model, response, max_tokens=max_tokens, latency_ms=latency_ms)

    def map_response(self, model: Model, response: Any, *, max_tokens: int, latency_ms: int) -> CallResult:
        """An SDK `Response` -> `CallResult`. Separate so tests can feed it a built Response."""
        model_id = model.id_for_adapter
        request_id = getattr(response, "_request_id", None)
        usage = getattr(response, "usage", None)
        input_tokens = usage.input_tokens if usage else None
        output_tokens = usage.output_tokens if usage else None
        details = getattr(usage, "output_tokens_details", None) if usage else None
        reasoning_tokens = details.reasoning_tokens if details else None
        cost = cost_from_tokens(model, input_tokens, output_tokens)

        base: dict[str, Any] = {
            "model": model_id, "provider": PROVIDER, "input_tokens": input_tokens, "output_tokens": output_tokens,
            "cost_usd": cost, "latency_ms": latency_ms, "reasoning_tokens": reasoning_tokens,
            "request_id": request_id, "adapter": NAME,
        }

        if response.error is not None:
            return CallResult(raw_text=None, parsed=None, finish_reason=response.status,
                              error=f"model: {response.error.code}: {response.error.message}"[:500], **base)

        finish_reason = _finish_reason(response)
        raw_text = response.output_text or None
        refusal = _refusal(response)
        if raw_text is None and refusal:
            return CallResult(raw_text=None, parsed=None, finish_reason=finish_reason,
                              error=f"refusal: {refusal[:500]}", **base)

        parsed, error = parse_or_error(raw_text, finish_reason, max_tokens, reasoning_tokens)
        return CallResult(raw_text=raw_text, parsed=parsed, finish_reason=finish_reason, error=error, **base)


def _finish_reason(response: Any) -> str | None:
    """`completed` -> "stop"; `incomplete` on the output cap -> "length"; anything else verbatim."""
    status = getattr(response, "status", None)
    if status == "completed":
        return "stop"
    if status == "incomplete":
        details = getattr(response, "incomplete_details", None)
        reason = getattr(details, "reason", None)
        return _FINISH_BY_INCOMPLETE_REASON.get(reason, reason or status)
    return status


def _refusal(response: Any) -> str | None:
    for item in getattr(response, "output", None) or []:
        if getattr(item, "type", None) != "message":
            continue
        for part in getattr(item, "content", None) or []:
            if getattr(part, "type", None) == "refusal":
                return getattr(part, "refusal", None) or "refused without a message"
    return None
