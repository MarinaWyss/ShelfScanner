"""In-memory stand-ins for the two seams the web layer has: sessions and the pipeline.

Used by the unit tests, the Playwright suite, and `SHELFSCANNER_FAKE_PIPELINE=1`
for running the server with no Supabase project and no provider key. The fake
pipeline still goes through `router.vision`, so the router seam is exercised.
"""

from __future__ import annotations

import time
from itertools import count
from typing import Any

from shelfscanner import router
from shelfscanner.adapters.base import DEFAULT_MAX_TOKENS, CallResult
from shelfscanner.config import Model
from shelfscanner.extract import titles_from
from shelfscanner.router import Progress
from shelfscanner.web.pipeline import Reading

DEFAULT_TITLES = ["Dune", "The Left Hand of Darkness", "Piranesi"]


class FakeClient:
    """A ModelClient that answers with fixed JSON, or with an error, after an optional delay."""

    def __init__(self, parsed: Any = None, *, error: str | None = None, delay_s: float = 0.0) -> None:
        self.parsed = parsed if parsed is not None else {"books": [{"title": t} for t in DEFAULT_TITLES]}
        self.error = error
        self.delay_s = delay_s
        self.calls: list[tuple[str, str, int]] = []

    def vision(self, model: Model, prompt: str, image_jpeg: bytes, *, max_tokens: int = DEFAULT_MAX_TOKENS,
               on_progress: Progress | None = None, schema: dict | None = None) -> CallResult:
        self.calls.append(("vision", model.alias, len(image_jpeg)))
        if on_progress:
            on_progress("reading")
        if self.delay_s:
            time.sleep(self.delay_s)
        if self.error:
            return CallResult(model.slug, "fake", None, None, None, None, None, 1, self.error, adapter="fake")
        return CallResult(model.slug, "fake", "{}", self.parsed, 10, 5, 0.0, 1, None, "stop", adapter="fake")

    def text(self, model: Model, prompt: str, input_text: str, *, max_tokens: int = DEFAULT_MAX_TOKENS,
             on_progress: Progress | None = None, schema: dict | None = None) -> CallResult:
        self.calls.append(("text", model.alias, len(input_text)))
        return CallResult(model.slug, "fake", "{}", self.parsed, 10, 5, 0.0, 1, None, "stop", adapter="fake")


class MemorySessions:
    def __init__(self) -> None:
        self.rows: dict[str, int] = {}
        self.seen: dict[int, int] = {}
        self._ids = count(1)

    def find(self, token_hash: str) -> int | None:
        session_id = self.rows.get(token_hash)
        if session_id is not None:
            self.seen[session_id] = self.seen.get(session_id, 0) + 1
        return session_id

    def create(self, token_hash: str) -> int:
        session_id = next(self._ids)
        self.rows[token_hash] = session_id
        return session_id


class FakePipeline:
    """Photos in a dict, readings from a FakeClient through the router. `fail_store` makes
    the upload stage fail so the error path can be tested."""

    def __init__(self, client: FakeClient | None = None, *, fail_store: str | None = None) -> None:
        self.client = client or FakeClient()
        self.fail_store = fail_store
        self.blobs: dict[str, bytes] = {}
        self.photos: dict[int, dict] = {}
        self.readings: dict[int, Reading] = {}
        self._ids = count(1)

    def store(self, session_id: int, jpeg: bytes) -> dict:
        if self.fail_store:
            raise RuntimeError(self.fail_store)
        photo_id = next(self._ids)
        storage_path = f"sessions/{session_id}/{photo_id}.jpg"
        self.blobs[storage_path] = jpeg
        row = {"id": photo_id, "storage_path": storage_path, "titles": [], "partial_titles": [],
               "notes": None, "session_id": session_id}
        self.photos[photo_id] = row
        return row

    def photo(self, photo_id: int, session_id: int) -> dict | None:
        row = self.photos.get(photo_id)
        return row if row and row["session_id"] == session_id else None

    def read(self, photo: dict, on_progress: Progress) -> Reading:
        res = router.vision(router.primary("reading"), "fake prompt", self.blobs[photo["storage_path"]],
                            client=self.client, on_progress=on_progress)
        reading = Reading(titles=titles_from(res.parsed)) if res.ok else Reading(error=res.error)
        self.readings[photo["id"]] = reading
        return reading

    def result(self, photo_id: int) -> Reading | None:
        return self.readings.get(photo_id)
