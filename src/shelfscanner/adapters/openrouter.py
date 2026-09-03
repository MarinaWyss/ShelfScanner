"""OpenRouter adapter: one OpenAI-compatible POST via httpx, addressed by slug (001 D13).

Kept behind the router for trying models we have no SDK for (002). Cost is as OpenRouter
reports it, which includes its markup; tokens are logged so direct cost can be recomputed.
"""

from __future__ import annotations

import base64
import json
import time
from collections.abc import Callable
from typing import Any

import httpx

from shelfscanner.adapters.base import DEFAULT_MAX_TOKENS, CallResult, failed, parse_or_error
from shelfscanner.config import Model
from shelfscanner.settings import openrouter_api_key

ENDPOINT = "https://openrouter.ai/api/v1/chat/completions"
TIMEOUT_S = 180.0
NAME = "openrouter"


class OpenRouterClient:
    # `schema` is accepted and ignored: structured output is not uniformly exposed through
    # OpenRouter (001 D9), so the prompt alone describes the JSON here.
    def vision(self, model: Model, prompt: str, image_jpeg: bytes, *, max_tokens: int = DEFAULT_MAX_TOKENS,
               on_progress: Callable[[str], None] | None = None, schema: dict | None = None) -> CallResult:
        return self._call(model, prompt, image_jpeg=image_jpeg, max_tokens=max_tokens)

    def text(self, model: Model, prompt: str, input_text: str, *, max_tokens: int = DEFAULT_MAX_TOKENS,
             on_progress: Callable[[str], None] | None = None, schema: dict | None = None) -> CallResult:
        return self._call(model, prompt, text=input_text, max_tokens=max_tokens)

    def _call(self, model: Model, prompt: str, *, image_jpeg: bytes | None = None, text: str | None = None,
              max_tokens: int) -> CallResult:
        content: list[dict[str, Any]] = []
        if image_jpeg is not None:
            b64 = base64.b64encode(image_jpeg).decode("ascii")
            content.append({"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}})
        content.append({"type": "text", "text": prompt if text is None else f"{prompt}\n\n{text}"})

        body: dict[str, Any] = {
            "model": model.slug,
            "messages": [{"role": "user", "content": content}],
            "max_tokens": max_tokens,
            "usage": {"include": True},
        }
        if model.reasoning_effort:
            body["reasoning"] = {"effort": model.reasoning_effort}
        headers = {
            "Authorization": f"Bearer {openrouter_api_key()}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://github.com/MarinaWyss/ShelfScanner",
            "X-Title": "ShelfScanner",
        }

        started = time.perf_counter()
        try:
            resp = httpx.post(ENDPOINT, json=body, headers=headers, timeout=TIMEOUT_S)
        except httpx.HTTPError as e:
            return failed(model.slug, NAME, started, f"transport: {e!r}")
        latency_ms = int((time.perf_counter() - started) * 1000)

        try:
            data = resp.json()
        except ValueError:
            return failed(model.slug, NAME, started, f"http {resp.status_code}: non-JSON body {resp.text[:200]!r}")
        if resp.status_code != 200 or "error" in data:
            return failed(model.slug, NAME, started, f"http {resp.status_code}: {json.dumps(data.get('error', data))[:500]}")

        usage = data.get("usage") or {}
        provider = data.get("provider")
        reasoning_tokens = (usage.get("completion_tokens_details") or {}).get("reasoning_tokens")
        request_id = data.get("id")
        try:
            choice = data["choices"][0]
            raw_text = choice["message"]["content"]
        except (KeyError, IndexError, TypeError):
            return CallResult(model.slug, provider, None, None, usage.get("prompt_tokens"),
                              usage.get("completion_tokens"), usage.get("cost"), latency_ms,
                              f"no choices in response: {json.dumps(data)[:500]}",
                              request_id=request_id, adapter=NAME)
        finish_reason = choice.get("finish_reason")
        parsed, error = parse_or_error(raw_text, finish_reason, max_tokens, reasoning_tokens)
        return CallResult(
            model=model.slug, provider=provider, raw_text=raw_text, parsed=parsed,
            input_tokens=usage.get("prompt_tokens"), output_tokens=usage.get("completion_tokens"),
            cost_usd=usage.get("cost"), latency_ms=latency_ms, error=error,
            finish_reason=finish_reason, reasoning_tokens=reasoning_tokens,
            request_id=request_id, adapter=NAME,
        )
