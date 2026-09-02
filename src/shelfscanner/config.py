"""Candidate models and spike-wide settings, read from config/models.toml."""

from __future__ import annotations

import tomllib
from dataclasses import dataclass
from functools import lru_cache

from shelfscanner.settings import REPO_ROOT

CONFIG_PATH = REPO_ROOT / "config" / "models.toml"


@dataclass(frozen=True)
class Model:
    alias: str
    slug: str
    provider: str
    price_input: float  # USD per million input tokens, for reference only
    price_output: float
    reasoning_effort: str | None = None  # OpenRouter `reasoning.effort`; None sends nothing (model default)


@dataclass(frozen=True)
class Config:
    match_threshold: float
    default_max_edge: int
    models: dict[str, Model]

    def model(self, name: str) -> Model:
        """Look a model up by alias (`haiku`) or full OpenRouter slug."""
        if name in self.models:
            return self.models[name]
        for m in self.models.values():
            if m.slug == name:
                return m
        known = ", ".join(f"{m.alias} ({m.slug})" for m in self.models.values())
        raise SystemExit(f"Unknown model {name!r}. Known: {known}")


@lru_cache(maxsize=1)
def load_config() -> Config:
    raw = tomllib.loads(CONFIG_PATH.read_text())
    models = {
        alias: Model(alias=alias, **{k: v for k, v in body.items()})
        for alias, body in raw["models"].items()
    }
    return Config(
        match_threshold=float(raw["settings"]["match_threshold"]),
        default_max_edge=int(raw["settings"]["default_max_edge"]),
        models=models,
    )
