"""The router: which adapter serves a model, and which model serves a stage (change 002).

Two operations, `vision` and `text`. Pipeline code calls these and never imports an adapter.
A test or the web layer can pass its own `ModelClient` to bypass every provider.
"""

from __future__ import annotations

import importlib
from functools import lru_cache
from pathlib import Path
from typing import Callable, Protocol

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


@lru_cache(maxsize=None)
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
