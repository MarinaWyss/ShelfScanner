"""Spend guard (change 002, task 0): model-calling code refuses to run once the runs tables sum past
SHELFSCANNER_SPEND_CAP_USD.

The cap comes from `.env`; unset means no cap. Spend is `cost_usd` summed over `extractions` and
`recommendations` since `spend_since` under `[settings]` in config/models.toml (a date; missing
means since the epoch). Moving that date starts a new budget; raising the cap widens it.
"""

from __future__ import annotations

import os
import tomllib
from datetime import UTC, date, datetime
from pathlib import Path

from dotenv import load_dotenv

from shelfscanner.config import CONFIG_PATH
from shelfscanner.settings import REPO_ROOT

ENV_VAR = "SHELFSCANNER_SPEND_CAP_USD"
SINCE_KEY = "spend_since"
TABLES = ("extractions", "recommendations")
EPOCH = datetime(1970, 1, 1, tzinfo=UTC)


def spend_cap() -> float | None:
    """The cap in USD, or None when no cap is set."""
    load_dotenv(REPO_ROOT / ".env")
    raw = os.environ.get(ENV_VAR, "").strip()
    if not raw:
        return None
    try:
        cap = float(raw)
    except ValueError:
        raise SystemExit(f"{ENV_VAR} must be a number of dollars, got {raw!r}") from None
    if cap < 0:
        raise SystemExit(f"{ENV_VAR} must not be negative, got {raw!r}")
    return cap


def spend_since(config_path: Path | None = None) -> datetime:
    """Start of the budget window: `settings.spend_since` in config, else the epoch."""
    config_path = config_path or CONFIG_PATH
    raw = tomllib.loads(config_path.read_text()).get("settings", {}).get(SINCE_KEY)
    if raw is None:
        return EPOCH
    if isinstance(raw, str):
        try:
            raw = datetime.fromisoformat(raw)
        except ValueError:
            raise SystemExit(f"settings.{SINCE_KEY} in {config_path} must be a date, got {raw!r}") from None
    if isinstance(raw, datetime):
        return raw if raw.tzinfo else raw.replace(tzinfo=UTC)
    if isinstance(raw, date):
        return datetime(raw.year, raw.month, raw.day, tzinfo=UTC)
    raise SystemExit(f"settings.{SINCE_KEY} in {config_path} must be a date, got {raw!r}")


def spent_since(client, since: datetime) -> float:
    """`cost_usd` summed over both runs tables for rows created at or after `since`."""
    total = 0.0
    for table in TABLES:
        rows = client.table(table).select("cost_usd").gte("created_at", since.isoformat()).execute().data
        total += sum(float(r["cost_usd"]) for r in rows if r.get("cost_usd") is not None)
    return total


def check_spend(client=None, *, cap: float | None = None, since: datetime | None = None) -> float | None:
    """Call before a model call. Returns the spend so far, or None when no cap is set; raises SystemExit
    once the spend has reached the cap. `client` defaults to the Supabase client; `cap` and `since` default
    to the environment and config."""
    cap = spend_cap() if cap is None else cap
    if cap is None:
        return None
    since = spend_since() if since is None else since
    if client is None:
        from shelfscanner.db import get_client

        client = get_client()
    spent = spent_since(client, since)
    if spent >= cap:
        raise SystemExit(
            f"Spend cap reached: ${spent:.4f} logged since {since:%Y-%m-%d} against {ENV_VAR}={cap:g}. "
            f"Raise the cap in .env or move settings.{SINCE_KEY} in config/models.toml to start a new budget."
        )
    return spent
