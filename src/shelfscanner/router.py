"""The router: which adapter serves a model, and which model serves a stage (change 002).

Two operations, `vision` and `text`. Pipeline code calls these and never imports an adapter.
A test or the web layer can pass its own `ModelClient` to bypass every provider.
"""

from __future__ import annotations

import importlib
from collections.abc import Callable
from dataclasses import dataclass
from functools import cache
from pathlib import Path
from typing import Protocol

from shelfscanner.adapters.base import DEFAULT_MAX_TOKENS, CallResult
from shelfscanner.config import Model, Stage, load_config
from shelfscanner.settings import REPO_ROOT

PROMPTS_DIR = REPO_ROOT / "prompts"

# adapter name in config -> "module:Class". Workers add the module; the mapping is fixed here
# so three adapters can be written in parallel without touching this file.
ADAPTERS: dict[str, str] = {
    "openrouter": "shelfscanner.adapters.openrouter:OpenRouterClient",
    "google": "shelfscanner.adapters.google:GoogleClient",
    "openai": "shelfscanner.adapters.openai:OpenAIClient",
    "anthropic": "shelfscanner.adapters.anthropic:AnthropicClient",
}

Progress = Callable[[str], None]


class ModelClient(Protocol):
    """What every adapter implements. `model` carries the id, prices and reasoning setting."""

    def vision(self, model: Model, prompt: str, image_jpeg: bytes, *, max_tokens: int = DEFAULT_MAX_TOKENS,
               on_progress: Progress | None = None, schema: dict | None = None) -> CallResult: ...

    def text(self, model: Model, prompt: str, input_text: str, *, max_tokens: int = DEFAULT_MAX_TOKENS,
             on_progress: Progress | None = None, schema: dict | None = None) -> CallResult: ...


def load_prompt(name: str) -> tuple[str, str]:
    """Return (prompt_version, text) for prompts/<name>.md. The version is the filename (001 D8)."""
    path = PROMPTS_DIR / f"{name}.md"
    if not path.exists():
        raise SystemExit(f"No prompt file {path}")
    return path.name, path.read_text()


@cache
def client_for(adapter: str) -> ModelClient:
    """Instantiate the adapter class named in config. Import happens here, so a missing SDK only
    fails when that provider is actually used."""
    try:
        target = ADAPTERS[adapter]
    except KeyError:
        raise SystemExit(f"Unknown adapter {adapter!r}. Known: {', '.join(ADAPTERS)}") from None
    module_name, class_name = target.split(":")
    try:
        module = importlib.import_module(module_name)
    except ModuleNotFoundError as e:
        raise SystemExit(f"Adapter {adapter!r} needs {e.name}: uv add {e.name}") from None
    return getattr(module, class_name)()


def vision(model: Model, prompt: str, image_jpeg: bytes, *, client: ModelClient | None = None,
           max_tokens: int = DEFAULT_MAX_TOKENS, on_progress: Progress | None = None,
           schema: dict | None = None) -> CallResult:
    """`schema` is the reply's JSON Schema; adapters with native structured output attach it."""
    return (client or client_for(model.adapter)).vision(model, prompt, image_jpeg, max_tokens=max_tokens,
                                                        on_progress=on_progress, schema=schema)


def text(model: Model, prompt: str, input_text: str, *, client: ModelClient | None = None,
         max_tokens: int = DEFAULT_MAX_TOKENS, on_progress: Progress | None = None,
         schema: dict | None = None) -> CallResult:
    return (client or client_for(model.adapter)).text(model, prompt, input_text, max_tokens=max_tokens,
                                                      on_progress=on_progress, schema=schema)


def stage(name: str) -> Stage:
    """The models configured for a stage: `reading` or `choosing`."""
    return load_config().stage(name)


def primary(name: str) -> Model:
    return load_config().model(stage(name).primary)


def prompt_path(name: str) -> Path:
    return PROMPTS_DIR / f"{name}.md"


# --- failover (002 D8) ---------------------------------------------------------------------

# Errors that mean the provider, not the model's answer, failed. A parse failure or a wrong
# count is a finding about the model and is not retried elsewhere.
FAILOVER_ERROR_PREFIXES = ("http ", "transport", "sdk", "config", "no choices", "GEMINI_API_KEY", "OPENAI_API_KEY",
                           "ANTHROPIC_API_KEY")


def should_fail_over(res: CallResult) -> bool:
    if res.ok:
        return False
    if res.truncated:
        return True
    return (res.error or "").startswith(FAILOVER_ERROR_PREFIXES)


@dataclass(frozen=True)
class StageResult:
    """A stage's call, possibly after one failover. `model` is the model that produced `result`."""

    result: CallResult
    model: Model
    failover_from: str | None = None  # slug of the primary that failed first
    failover_error: str | None = None  # its error


def with_failover(stage_name: str, model: Model | None, call: Callable[[Model], CallResult],
                  on_progress: Progress | None = None) -> StageResult:
    """Run `call` on `model` (default: the stage's primary). If that is the stage's primary and it
    fails for a provider reason, run once more on the stage's fallback and record both. An
    explicitly chosen non-primary model never fails over, so matrix rows stay per model."""
    cfg = load_config()
    st = cfg.stage(stage_name)
    chosen = model or cfg.model(st.primary)
    res = call(chosen)
    if res.ok or st.fallback is None or chosen.alias != st.primary or not should_fail_over(res):
        return StageResult(res, chosen)
    fallback = cfg.model(st.fallback)
    if on_progress:
        on_progress(f"{stage_name}: {chosen.alias} failed ({(res.error or '')[:60]}), trying {fallback.alias}")
    res2 = call(fallback)
    return StageResult(res2, fallback, failover_from=chosen.slug, failover_error=res.error)
