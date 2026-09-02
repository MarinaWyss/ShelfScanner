"""The one model adapter for the spike (proposal D13).

A plain POST to OpenRouter's OpenAI-compatible chat endpoint via httpx. No
provider SDK, so there is nothing to unwind when the winner gets its own
integration in a later change. JSON is requested in the prompt and parsed
here (D9); a parse failure is returned as an error, never retried.
"""

from __future__ import annotations

import base64
import json
import re
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import httpx

from shelfscanner.settings import REPO_ROOT, openrouter_api_key

ENDPOINT = "https://openrouter.ai/api/v1/chat/completions"
PROMPTS_DIR = REPO_ROOT / "prompts"
TIMEOUT_S = 180.0
DEFAULT_MAX_TOKENS = 4096

_FENCE = re.compile(r"^\s*```(?:json)?\s*(.*?)\s*```\s*$", re.DOTALL)


@dataclass(frozen=True)
class CallResult:
    model: str  # slug requested
    provider: str | None  # upstream provider OpenRouter actually routed to
    raw_text: str | None
    parsed: Any  # decoded JSON, or None when parsing failed or the call errored
    input_tokens: int | None
    output_tokens: int | None
    cost_usd: float | None
    latency_ms: int
    error: str | None
    finish_reason: str | None = None  # "stop", "length", ... as normalised by OpenRouter
    reasoning_tokens: int | None = None  # counted inside output_tokens; some models spend most of the cap here

    @property
    def ok(self) -> bool:
        return self.error is None


def load_prompt(name: str) -> tuple[str, str]:
    """Return (prompt_version, text) for prompts/<name>.md. The version is the filename (D8)."""
    path = PROMPTS_DIR / f"{name}.md"
    if not path.exists():
        raise SystemExit(f"No prompt file {path}")
    return path.name, path.read_text()


def parse_json(text: str) -> Any:
    """Decode a JSON object from a model reply, tolerating a code fence around it."""
    m = _FENCE.match(text)
    candidate = m.group(1) if m else text
    try:
        return json.loads(candidate)
    except json.JSONDecodeError:
        # Last resort: the outermost {...} in the reply.
        start, end = candidate.find("{"), candidate.rfind("}")
        if start == -1 or end <= start:
            raise
        return json.loads(candidate[start : end + 1])


def call(
    model_slug: str,
    prompt: str,
    *,
    image_jpeg: bytes | None = None,
    text: str | None = None,
    max_tokens: int = DEFAULT_MAX_TOKENS,
) -> CallResult:
    """One chat completion. `prompt` is the instruction; `image_jpeg` and/or `text` are the input.

    Never raises for a model or transport failure: those come back with `error` set
    so the caller can log a row for them.
    """
    content: list[dict[str, Any]] = []
    if image_jpeg is not None:
        b64 = base64.b64encode(image_jpeg).decode("ascii")
        content.append({"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}})
    user_text = prompt if text is None else f"{prompt}\n\n{text}"
    content.append({"type": "text", "text": user_text})

    body = {
        "model": model_slug,
        "messages": [{"role": "user", "content": content}],
        "max_tokens": max_tokens,
        "usage": {"include": True},
    }
    headers = {
        "Authorization": f"Bearer {openrouter_api_key()}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/MarinaWyss/ShelfScanner",
        "X-Title": "ShelfScanner spike",
    }

    started = time.perf_counter()
    try:
        resp = httpx.post(ENDPOINT, json=body, headers=headers, timeout=TIMEOUT_S)
    except httpx.HTTPError as e:
        return _failed(model_slug, started, f"transport: {e!r}")
    latency_ms = int((time.perf_counter() - started) * 1000)

    try:
        data = resp.json()
    except ValueError:
        return _failed(model_slug, started, f"http {resp.status_code}: non-JSON body {resp.text[:200]!r}")
    if resp.status_code != 200 or "error" in data:
        return _failed(model_slug, started, f"http {resp.status_code}: {json.dumps(data.get('error', data))[:500]}")

    usage = data.get("usage") or {}
    provider = data.get("provider")
    reasoning_tokens = (usage.get("completion_tokens_details") or {}).get("reasoning_tokens")
    try:
        choice = data["choices"][0]
        raw_text = choice["message"]["content"]
    except (KeyError, IndexError, TypeError):
        return CallResult(model_slug, provider, None, None, usage.get("prompt_tokens"),
                          usage.get("completion_tokens"), usage.get("cost"), latency_ms,
                          f"no choices in response: {json.dumps(data)[:500]}")
    finish_reason = choice.get("finish_reason")

    parsed: Any = None
    error: str | None = None
    try:
        parsed = parse_json(raw_text or "")
    except json.JSONDecodeError as e:
        if finish_reason == "length":
            # Hitting max_tokens is a budget failure, not a "cannot emit JSON" failure (D9).
            error = f"truncated: hit max_tokens={max_tokens} (reasoning_tokens={reasoning_tokens})"
        else:
            error = f"json parse: {e}"

    return CallResult(
        model=model_slug,
        provider=provider,
        raw_text=raw_text,
        parsed=parsed,
        input_tokens=usage.get("prompt_tokens"),
        output_tokens=usage.get("completion_tokens"),
        cost_usd=usage.get("cost"),
        latency_ms=latency_ms,
        error=error,
        finish_reason=finish_reason,
        reasoning_tokens=reasoning_tokens,
    )


def _failed(model_slug: str, started: float, error: str) -> CallResult:
    return CallResult(model_slug, None, None, None, None, None, None,
                      int((time.perf_counter() - started) * 1000), error)
