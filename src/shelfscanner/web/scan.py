"""Scan routes (003): upload a photo, stream the stages, fetch the result.

A scan is identified by its `photos` row id. Nothing is held in process
between requests, so the same code runs under one uvicorn process on a laptop
and as a Vercel function: `POST /scan` stores the photo, `GET /scan/{id}/events`
runs the reading stage inside the event stream, `GET /scan/{id}` reads the
latest logged extraction.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from typing import Annotated

from anyio import to_thread
from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import HTMLResponse, JSONResponse, StreamingResponse
from PIL import UnidentifiedImageError

from shelfscanner.config import load_config
from shelfscanner.images import resize
from shelfscanner.web.pipeline import Pipeline, Reading

MAX_BODY_BYTES = 4 * 1024 * 1024
KEEPALIVE_S = 15.0
CLOSE_EVENT = "close"  # sent after done or failed so the browser stops reconnecting

TOO_BIG = ("That photo is over 4 MB. The page shrinks photos before sending when the browser can; "
           "try a smaller photo or a newer browser.")
NOT_AN_IMAGE = "That file is not an image this app can read. Choose a JPEG or PNG."
STORE_FAILED = "Uploading the photo failed. Check the connection and try again."

STAGE_LABELS = [("uploaded", "Photo uploaded"), ("reading", "Reading the shelf"), ("done", "Titles ready")]

router = APIRouter()
log = logging.getLogger("shelfscanner.web")


@dataclass(frozen=True)
class StageRow:
    name: str
    label: str
    state: str  # todo | active | done | failed


def stage_rows(stage: str) -> list[StageRow]:
    """One row per progress stage, given the scan's current stage (uploaded, reading, done, failed)."""
    completed = {"uploaded": 1, "reading": 1, "done": 3, "failed": 1}[stage]
    current = {"reading": "active", "failed": "failed"}.get(stage)
    rows = []
    for i, (name, label) in enumerate(STAGE_LABELS):
        if i < completed:
            state = "done"
        elif i == completed and current:
            state = current
        else:
            state = "todo"
        rows.append(StageRow(name, label, state))
    return rows


def sse(event: str, data: str) -> str:
    lines = [f"event: {event}"] + [f"data: {line}" for line in (data.splitlines() or [""])]
    return "\n".join(lines) + "\n\n"


def _pipeline(request: Request) -> Pipeline:
    return request.app.state.pipeline


def _wants_html(request: Request) -> bool:
    return "hx-request" in request.headers


def _render(request: Request, name: str, **context) -> str:
    return request.app.state.templates.get_template(name).render(**context)


def panel(request: Request, scan_id: int, stage: str, *, titles: list[str] | None = None,
          error: str | None = None, note: str | None = None, live: bool = False) -> str:
    """The progress list and, once there is one, the result; `live` wraps it in the SSE connection."""
    return _render(request, "panel.html", scan_id=scan_id, stage=stage, rows=stage_rows(stage),
                   titles=titles or [], error=error, note=note, live=live)


def panel_for(request: Request, scan_id: int, reading: Reading | None) -> str:
    if reading is None:
        return panel(request, scan_id, "uploaded", live=True)
    if reading.ok:
        return panel(request, scan_id, "done", titles=reading.titles)
    return panel(request, scan_id, "failed", error=reading_error(reading))


def reading_error(reading: Reading) -> str:
    return f"Reading the shelf failed: {reading.error}"


def _refuse(request: Request, status: int, message: str, stage: str):
    if _wants_html(request):
        return HTMLResponse(_render(request, "error.html", message=message, stage=stage), status_code=status)
    return JSONResponse({"error": message, "stage": stage}, status_code=status)


@router.post("/scan")
async def create_scan(request: Request, photo: Annotated[UploadFile, File()],
                      resized: Annotated[str, Form()] = "0"):
    session_id = request.state.session_id
    length = request.headers.get("content-length", "")
    if length.isdigit() and int(length) > MAX_BODY_BYTES:
        return _refuse(request, 413, TOO_BIG, "uploading")
    data = await photo.read()
    if len(data) > MAX_BODY_BYTES:
        return _refuse(request, 413, TOO_BIG, "uploading")
    if resized != "1":
        log.info("scan: session %s sent the original file (%d bytes); resizing on the server", session_id, len(data))

    try:
        img = await to_thread.run_sync(resize, data, load_config().default_max_edge)
    except (UnidentifiedImageError, OSError, ValueError):
        return _refuse(request, 400, NOT_AN_IMAGE, "uploading")

    try:
        row = await to_thread.run_sync(_pipeline(request).store, session_id, img.jpeg)
    except Exception:
        log.exception("scan: storing the photo for session %s failed", session_id)
        return _refuse(request, 500, STORE_FAILED, "uploading")

    log.info("scan %s: session %s stored %dx%d, %d bytes", row["id"], session_id, img.width, img.height, len(img.jpeg))
    if _wants_html(request):
        return HTMLResponse(panel(request, row["id"], "uploaded", live=True), status_code=201)
    return JSONResponse({"id": row["id"], "status": "pending"}, status_code=201)


async def _owned_photo(request: Request, scan_id: int) -> dict:
    photo = await to_thread.run_sync(_pipeline(request).photo, scan_id, request.state.session_id)
    if photo is None:
        raise HTTPException(status_code=404, detail="No such scan for this device")
    return photo


async def _run_reading(request: Request, photo: dict):
    """Run the reading stage in a worker thread, yielding progress notes as they arrive."""
    loop = asyncio.get_running_loop()
    notes: asyncio.Queue[str] = asyncio.Queue()
    future = loop.run_in_executor(None, _pipeline(request).read, photo,
                                  lambda note: loop.call_soon_threadsafe(notes.put_nowait, note))
    next_note = asyncio.ensure_future(notes.get())
    while True:
        done, _ = await asyncio.wait({future, next_note}, return_when=asyncio.FIRST_COMPLETED, timeout=KEEPALIVE_S)
        if next_note in done:
            yield next_note.result()
            next_note = asyncio.ensure_future(notes.get())
        elif future in done:
            break
        else:
            yield None  # keepalive
    next_note.cancel()
    while not notes.empty():
        yield notes.get_nowait()
    try:
        yield future.result()
    except Exception as e:  # the pipeline reports model failures in the row; this is anything else
        log.exception("scan %s: reading raised", photo["id"])
        yield Reading(error=f"{type(e).__name__}: {e}")


async def _events(request: Request, photo: dict):
    scan_id = photo["id"]
    reading = await to_thread.run_sync(_pipeline(request).result, scan_id)
    if reading is None:
        yield sse("uploaded", panel(request, scan_id, "uploaded"))
        yield sse("reading", panel(request, scan_id, "reading"))
        async for item in _run_reading(request, photo):
            if isinstance(item, Reading):
                reading = item
            elif item is None:
                yield ": keepalive\n\n"
            elif item != "reading":
                yield sse("reading", panel(request, scan_id, "reading", note=item))
    assert reading is not None
    if reading.ok:
        log.info("scan %s: done, %d titles", scan_id, len(reading.titles))
        yield sse("done", panel(request, scan_id, "done", titles=reading.titles))
    else:
        log.warning("scan %s: failed at reading: %s", scan_id, reading.error)
        yield sse("failed", panel(request, scan_id, "failed", error=reading_error(reading)))
    yield sse(CLOSE_EVENT, "")


@router.get("/scan/{scan_id}/events")
async def scan_events(scan_id: int, request: Request):
    photo = await _owned_photo(request, scan_id)
    return StreamingResponse(_events(request, photo), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@router.get("/scan/{scan_id}")
async def get_scan(scan_id: int, request: Request):
    await _owned_photo(request, scan_id)
    reading = await to_thread.run_sync(_pipeline(request).result, scan_id)
    if _wants_html(request):
        return HTMLResponse(panel_for(request, scan_id, reading))
    if reading is None:
        return JSONResponse({"id": scan_id, "status": "pending"})
    if reading.ok:
        return JSONResponse({"id": scan_id, "status": "done", "titles": reading.titles})
    return JSONResponse({"id": scan_id, "status": "failed", "stage": "reading", "error": reading.error})
