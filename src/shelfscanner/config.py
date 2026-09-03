"""Models, stages and pipeline-wide settings, read from config/models.toml."""

from __future__ import annotations

import tomllib
from dataclasses import dataclass
from datetime import date
from functools import lru_cache

from shelfscanner.settings import REPO_ROOT

CONFIG_PATH = REPO_ROOT / "config" / "models.toml"


@dataclass(frozen=True)
class Model:
    alias: str
    slug: str  # OpenRouter slug; also the name logged in `model` columns for continuity with change 001
    provider: str
    price_input: float  # USD per million input tokens
    price_output: float
    reasoning_effort: str | None = None  # passed to the adapter; None means the model's default
    adapter: str = "openrouter"  # key in router.ADAPTERS
    model_id: str | None = None  # the provider's own id when adapter != openrouter

    @property
    def id_for_adapter(self) -> str:
        return self.model_id or self.slug


@dataclass(frozen=True)
class Stage:
    name: str
    primary: str  # model alias
    fallback: str | None  # model alias used on provider error, timeout or truncation (002 D8)


@dataclass(frozen=True)
class Config:
    match_threshold: float
    default_max_edge: int
    prices_checked: date | None
    models: dict[str, Model]
    stages: dict[str, Stage]

    def model(self, name: str) -> Model:
        """Look a model up by alias (`haiku`), OpenRouter slug, or provider model id."""
        if name in self.models:
            return self.models[name]
        for m in self.models.values():
            if name in (m.slug, m.model_id):
                return m
        known = ", ".join(f"{m.alias} ({m.slug})" for m in self.models.values())
        raise SystemExit(f"Unknown model {name!r}. Known: {known}")

    def stage(self, name: str) -> Stage:
        try:
            return self.stages[name]
        except KeyError:
            raise SystemExit(f"Unknown stage {name!r}. Known: {', '.join(self.stages)}") from None


@lru_cache(maxsize=1)
def load_config() -> Config:
    raw = tomllib.loads(CONFIG_PATH.read_text())
    models = {alias: Model(alias=alias, **body) for alias, body in raw["models"].items()}
    stages = {name: Stage(name=name, primary=body["primary"], fallback=body.get("fallback"))
              for name, body in raw.get("stages", {}).items()}
    for st in stages.values():
        for alias in (st.primary, st.fallback):
            if alias is not None and alias not in models:
                raise SystemExit(f"Stage {st.name!r} names unknown model {alias!r}")
    checked = raw["settings"].get("prices_checked")
    return Config(
        match_threshold=float(raw["settings"]["match_threshold"]),
        default_max_edge=int(raw["settings"]["default_max_edge"]),
        prices_checked=checked if isinstance(checked, date) else None,
        models=models,
        stages=stages,
    )
