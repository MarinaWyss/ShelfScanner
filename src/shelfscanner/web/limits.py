"""Scan limits (008 task 1, extended by 017): scans per session and per address per rolling hour,
and the app's daily spend cap.

All are checked in `POST /scan` before anything is stored, and all fail loud
(008 D1): the refusal names the number, so a user who hits a limit knows what
happened and the save-rate metric is not diluted by silent degradation.

- `SHELFSCANNER_SCANS_PER_HOUR` (default 10): `photos` rows with the session
  created in the last hour, counted at the moment of the request.
- `SHELFSCANNER_SCANS_PER_ADDRESS_HOUR` (default 30): `photos` rows with the
  same `client_hash` in the last hour (017 D1). A session is whatever the
  cookie says; the address is what the connection says, so a client that
  drops its cookie between scans is still counted.
- `SHELFSCANNER_APP_DAILY_CAP_USD` (default 5): `cost_usd` summed over both
  runs tables since midnight UTC, every session together. The cap is the
  app's, not the user's; when it is reached nobody scans until tomorrow.

The rows are read through the pipeline, so the fake pipeline serves the tests.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Protocol

from dotenv import load_dotenv

from shelfscanner.settings import REPO_ROOT

SCANS_PER_HOUR_ENV = "SHELFSCANNER_SCANS_PER_HOUR"
SCANS_PER_ADDRESS_HOUR_ENV = "SHELFSCANNER_SCANS_PER_ADDRESS_HOUR"  # 017 D1
DAILY_CAP_ENV = "SHELFSCANNER_APP_DAILY_CAP_USD"
DEFAULT_SCANS_PER_HOUR = 10
DEFAULT_SCANS_PER_ADDRESS_HOUR = 30  # three devices' worth: a household or a shop's wifi is one address
DEFAULT_DAILY_CAP_USD = 5.0
WINDOW = timedelta(hours=1)

RATE_STATUS = 429
CAP_STATUS = 503


@dataclass(frozen=True)
class Limits:
    scans_per_hour: int = DEFAULT_SCANS_PER_HOUR
    daily_cap_usd: float = DEFAULT_DAILY_CAP_USD
    scans_per_address_hour: int = DEFAULT_SCANS_PER_ADDRESS_HOUR


@dataclass(frozen=True)
class Refusal:
    kind: str  # "rate" or "cap"
    message: str
    status: int


class Counts(Protocol):
    """The two reads the check needs; `Pipeline` provides both."""

    def scan_counts(self, session_id: int, client_hash: str | None, since: datetime) -> tuple[int, int]: ...

    def spent_since(self, since: datetime) -> float: ...


def _number(environ, name: str, default: float, kind: type) -> float:
    raw = environ.get(name, "").strip()
    if not raw:
        return default
    try:
        value = kind(raw)
    except ValueError:
        raise SystemExit(f"{name} must be a number, got {raw!r}") from None
    if value < 0:
        raise SystemExit(f"{name} must not be negative, got {raw!r}")
    return value


def from_env(environ=None) -> Limits:
    """The limits from the environment or `.env`; unset means the defaults."""
    if environ is None:
        load_dotenv(REPO_ROOT / ".env")
        environ = os.environ
    return Limits(scans_per_hour=int(_number(environ, SCANS_PER_HOUR_ENV, DEFAULT_SCANS_PER_HOUR, int)),
                  daily_cap_usd=float(_number(environ, DAILY_CAP_ENV, DEFAULT_DAILY_CAP_USD, float)),
                  scans_per_address_hour=int(_number(environ, SCANS_PER_ADDRESS_HOUR_ENV,
                                                     DEFAULT_SCANS_PER_ADDRESS_HOUR, int)))


def day_start(now: datetime) -> datetime:
    """Midnight UTC of the day `now` falls in: the start of the daily budget."""
    return now.astimezone(UTC).replace(hour=0, minute=0, second=0, microsecond=0)


def rate_message(count: int, limit: int) -> str:
    return (f"This device has scanned {count} {'shelf' if count == 1 else 'shelves'} in the last hour, and the "
            f"limit is {limit} per hour. Try again in a while.")


def address_message(count: int, limit: int) -> str:
    """017 D1: "this network", not "this device": a shared address is several devices."""
    return (f"This network has scanned {count} {'shelf' if count == 1 else 'shelves'} in the last hour, and the "
            f"limit is {limit} per hour for one network. Try again in a while.")


def cap_message(spent: float, cap: float) -> str:
    return (f"ShelfScanner has spent ${spent:.2f} on scans today, which reaches its daily limit of ${cap:.2f}. "
            f"Scans start again tomorrow (UTC).")


def check(counts: Counts, session_id: int, limits: Limits, now: datetime,
          client_hash: str | None = None) -> Refusal | None:
    """The refusal a scan gets right now, or None when it may go ahead. The session limit is checked
    first: a device at its limit is told so even when the app is also out of budget. Then the
    address (017 D1, skipped when the address is unknown), then the app's budget."""
    scans, by_address = counts.scan_counts(session_id, client_hash, now - WINDOW)
    if scans >= limits.scans_per_hour:
        return Refusal("rate", rate_message(scans, limits.scans_per_hour), RATE_STATUS)
    if client_hash is not None and by_address >= limits.scans_per_address_hour:
        return Refusal("rate", address_message(by_address, limits.scans_per_address_hour), RATE_STATUS)
    spent = counts.spent_since(day_start(now))
    if spent >= limits.daily_cap_usd:
        return Refusal("cap", cap_message(spent, limits.daily_cap_usd), CAP_STATUS)
    return None
