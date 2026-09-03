"""The boundary between the web layer and the pipeline (003).

The routes only ever call these four methods. `SupabasePipeline` is the real
thing: the bucket, the `photos` and `extractions` tables, and the router.
`fakes.FakePipeline` implements the same protocol in memory for tests and for
running the server without any credentials.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol

from shelfscanner import extract, router, storage
from shelfscanner.config import load_config
from shelfscanner.router import ModelClient, Progress


@dataclass(frozen=True)
class Reading:
    """What the reading stage produced for a photo: titles, or the error that stopped it."""

    titles: list[str] = field(default_factory=list)
    error: str | None = None

    @property
    def ok(self) -> bool:
        return self.error is None


class Pipeline(Protocol):
    def store(self, session_id: int, jpeg: bytes) -> dict:
        """Persist stripped JPEG bytes for a session; return the `photos` row."""
        ...

    def photo(self, photo_id: int, session_id: int) -> dict | None:
        """The photo row when it belongs to the session, else None."""
        ...

    def read(self, photo: dict, on_progress: Progress) -> Reading:
        """Run the reading stage over a stored photo, logging its row as the CLI would."""
        ...

    def result(self, photo_id: int) -> Reading | None:
        """The latest reading of a photo, or None when none has run."""
        ...


class SupabasePipeline:
    def __init__(self, client: ModelClient | None = None) -> None:
        self.client = client  # None means the router picks the adapter from config

    def store(self, session_id: int, jpeg: bytes) -> dict:
        return storage.store_session_photo(session_id, jpeg)

    def photo(self, photo_id: int, session_id: int) -> dict | None:
        return storage.get_session_photo(photo_id, session_id)

    def read(self, photo: dict, on_progress: Progress) -> Reading:
        cfg = load_config()
        row = extract.extract_photo(photo, router.primary("reading"), cfg.default_max_edge, extract.DEFAULT_PROMPT,
                                    client=self.client, on_progress=on_progress)
        if row.error:
            return Reading(error=row.error)
        return Reading(titles=extract.titles_from(extract.get_extraction(row.id)["parsed_titles"]))

    def result(self, photo_id: int) -> Reading | None:
        from shelfscanner.db import get_client

        res = (
            get_client()
            .table("extractions")
            .select("parsed_titles, error")
            .eq("photo_id", photo_id)
            .order("id", desc=True)
            .limit(1)
            .execute()
        )
        if not res.data:
            return None
        row = res.data[0]
        if row["error"]:
            return Reading(error=row["error"])
        return Reading(titles=extract.titles_from(row["parsed_titles"]))
