"""Photo retention (change 008, D2): delete old photo objects, keep the rows.

A photo row older than the window loses its object in the bucket and its
`storage_path`; the row itself stays so the metrics over `extractions` and
`recommendations` keep their photo. Labelled photos are the test set and are
never touched: a row is exempt when `titles` is non-empty, or when `set` (if
that column exists) is anything other than the default.

The exemption is applied twice on purpose: once as a server-side filter, and
again on every returned row before anything is deleted. A bug in either alone
deletes the test set.
"""

from __future__ import annotations

import argparse
import os
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any

from dotenv import load_dotenv
from postgrest.exceptions import APIError

from shelfscanner.settings import PHOTO_BUCKET, REPO_ROOT

RETENTION_DAYS_ENV = "SHELFSCANNER_RETENTION_DAYS"
DEFAULT_RETENTION_DAYS = 30
DEFAULT_SET = "core"  # label files without `set` mean core (006 contract)

BASE_COLUMNS = "id, storage_path, titles, created_at"


@dataclass(frozen=True)
class Candidate:
    """A row the job will (or, in a dry run, would) delete the object for."""

    id: int
    storage_path: str
    created_at: datetime


@dataclass
class Summary:
    window_days: int
    cutoff: datetime
    dry_run: bool
    candidates: list[Candidate] = field(default_factory=list)
    deleted: list[Candidate] = field(default_factory=list)
    failed: list[tuple[Candidate, str]] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.failed

    def lines(self) -> list[str]:
        verb = "would delete" if self.dry_run else "deleted"
        header = (
            f"retention: window {self.window_days} days, "
            f"cutoff {self.cutoff.isoformat(timespec='seconds')}, "
            f"{len(self.candidates)} candidate(s)"
        )
        out = [header]
        failed = {c.id: err for c, err in self.failed}
        for c in self.candidates:
            age = (self.cutoff - c.created_at).days + self.window_days
            if c.id in failed:
                out.append(f"FAILED  id={c.id} {c.storage_path} ({age}d): {failed[c.id]}")
            else:
                out.append(f"{verb:<12} id={c.id} {c.storage_path} ({age}d)")
        if not self.dry_run:
            out.append(f"{len(self.deleted)} deleted, {len(self.failed)} failed")
        return out


def retention_days(env: dict[str, str] | None = None) -> int:
    """The window in days from `SHELFSCANNER_RETENTION_DAYS`, default 30."""
    if env is None:
        load_dotenv(REPO_ROOT / ".env")
        env = dict(os.environ)
    raw = env.get(RETENTION_DAYS_ENV, "").strip()
    if not raw:
        return DEFAULT_RETENTION_DAYS
    try:
        days = int(raw)
    except ValueError:
        raise SystemExit(f"{RETENTION_DAYS_ENV} must be a whole number of days, got {raw!r}") from None
    if days < 1:
        raise SystemExit(f"{RETENTION_DAYS_ENV} must be at least 1, got {days}")
    return days


def has_set_column(client: Any) -> bool:
    """Whether `photos.set` exists yet (006 adds it); a failed select means no."""
    try:
        client.table("photos").select("set").limit(1).execute()
    except APIError:
        return False
    return True


def is_exempt(row: dict[str, Any], *, set_column: bool) -> bool:
    """True for any row that must never lose its object: the labelled test set."""
    if row.get("titles"):
        return True
    return bool(set_column and row.get("set") not in (None, DEFAULT_SET))


def parse_timestamp(value: str | datetime) -> datetime:
    ts = value if isinstance(value, datetime) else datetime.fromisoformat(value)
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=UTC)
    return ts


def select_candidates(client: Any, cutoff: datetime) -> list[Candidate]:
    """Rows older than `cutoff` that still have an object and are not exempt."""
    set_column = has_set_column(client)
    columns = f"{BASE_COLUMNS}, set" if set_column else BASE_COLUMNS
    query = (
        client.table("photos")
        .select(columns)
        .not_.is_("storage_path", "null")
        .lt("created_at", cutoff.isoformat())
        .eq("titles", "{}")
    )
    if set_column:
        query = query.or_(f"set.is.null,set.eq.{DEFAULT_SET}")
    rows = query.order("id").execute().data

    out: list[Candidate] = []
    for row in rows:
        # Re-check everything the server was asked to filter. This is the
        # guard that keeps a query bug from deleting the test set.
        if is_exempt(row, set_column=set_column):
            continue
        if not row.get("storage_path"):
            continue
        created_at = parse_timestamp(row["created_at"])
        if created_at >= cutoff:
            continue
        out.append(Candidate(id=int(row["id"]), storage_path=row["storage_path"], created_at=created_at))
    return out


def delete_photo_object(client: Any, candidate: Candidate, now: datetime) -> None:
    """Remove the object, then null the row's path. Object first: a failure
    between the two leaves a row pointing at nothing, which the next run
    repairs (removing a missing key is not an error); the reverse order would
    leave an orphaned object nobody can find."""
    client.storage.from_(PHOTO_BUCKET).remove([candidate.storage_path])
    (
        client.table("photos")
        .update({"storage_path": None, "photo_deleted_at": now.isoformat()})
        .eq("id", candidate.id)
        .execute()
    )


def run_retention(
    now: datetime | None = None,
    dry_run: bool = False,
    *,
    days: int | None = None,
    client: Any = None,
) -> Summary:
    """Delete objects for unlabelled photos older than the window. Returns what happened.

    `now` must be timezone-aware; it defaults to the current UTC time. `days`
    overrides the environment; `client` injects a fake in tests.
    """
    if now is None:
        now = datetime.now(UTC)
    if now.tzinfo is None:
        raise ValueError("now must be timezone-aware")
    if days is None:
        days = retention_days()
    if client is None:
        from shelfscanner.db import get_client

        client = get_client()

    cutoff = now - timedelta(days=days)
    summary = Summary(window_days=days, cutoff=cutoff, dry_run=dry_run)
    summary.candidates = select_candidates(client, cutoff)
    if dry_run:
        return summary

    for candidate in summary.candidates:
        try:
            delete_photo_object(client, candidate, now)
        except Exception as e:  # noqa: BLE001 - one bad object must not stop the rest
            summary.failed.append((candidate, f"{type(e).__name__}: {e}"))
        else:
            summary.deleted.append(candidate)
    return summary


def _retain(args: argparse.Namespace) -> None:
    summary = run_retention(dry_run=args.dry_run, days=args.days)
    for line in summary.lines():
        print(line)
    if not summary.ok:
        raise SystemExit(1)


def add_parser(subparsers: argparse._SubParsersAction) -> None:
    """Add `photos retain` to the `photos` subcommand group."""
    p = subparsers.add_parser(
        "retain",
        help="delete bucket objects for unlabelled photos older than the retention window",
    )
    p.add_argument("--dry-run", action="store_true", help="list what would be deleted; delete nothing")
    p.add_argument(
        "--days",
        type=int,
        default=None,
        help=f"retention window in days (default {RETENTION_DAYS_ENV} or {DEFAULT_RETENTION_DAYS})",
    )
    p.set_defaults(func=_retain)
