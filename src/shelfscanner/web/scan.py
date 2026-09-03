"""Scan routes (003, extended by 005): upload a photo, stream the stages, fetch the result.

A scan is identified by its `photos` row id. Nothing is held in process
between requests, so the same code runs under one uvicorn process on a laptop
and as a Vercel function: `POST /scan` stores the photo, `GET /scan/{id}/events`
runs the reading and choosing stages inside the event stream, `GET /scan/{id}`
reads the latest logged extraction and recommendation.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncIterator, Callable
from dataclasses import dataclass
from typing import Annotated, Any

from anyio import to_thread
from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import HTMLResponse, JSONResponse, StreamingResponse
from PIL import UnidentifiedImageError

from shelfscanner.config import load_config
from shelfscanner.images import resize
from shelfscanner.web.pipeline import Choosing, PickState, Pipeline, Reading, Scan, prefs_for_scan

MAX_BODY_BYTES = 4 * 1024 * 1024
KEEPALIVE_S = 15.0
CLOSE_EVENT = "close"  # sent after done or failed so the browser stops reconnecting

TOO_BIG = ("That photo is over 4 MB. The page shrinks photos before sending when the browser can; "
           "try a smaller photo or a newer browser.")
NOT_AN_IMAGE = "That file is not an image this app can read. Choose a JPEG or PNG."
STORE_FAILED = "Uploading the photo failed. Check the connection and try again."

STAGE_LABELS = [("uploaded", "Photo uploaded"), ("reading", "Reading the shelf"), ("choosing", "Choosing five for you"),
                ("done", "Picks ready")]
FAILED_TITLES = {"reading": "Reading the shelf failed", "choosing": "Choosing failed"}

router = APIRouter()
log = logging.getLogger("shelfscanner.web")


@dataclass(frozen=True)
class StageRow:
    name: str
    label: str
    state: str  # todo | active | done | failed


def stage_rows(stage: str, failed_stage: str | None = None) -> list[StageRow]:
    """One row per progress stage, given the scan's current stage (uploaded, reading, choosing, done,
    failed) and, when failed, the stage that failed."""
    names = [name for name, _ in STAGE_LABELS]
    if stage == "done":
        completed, current = len(names), None
    elif stage == "failed":
        completed, current = names.index(failed_stage or "reading"), "failed"
    elif stage == "uploaded":
        completed, current = 1, None
    else:  # reading or choosing, in progress
        completed, current = names.index(stage), "active"
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


def panel(request: Request, scan_id: int, stage: str, *, scan: Scan | None = None,
          states: dict[int, PickState] | None = None, note: str | None = None, live: bool = False) -> str:
    """The progress list and, once there is one, the result; `live` wraps it in the SSE connection."""
    failed_stage = scan.failed_stage if scan else None
    picks = scan.picks if scan else []
    return _render(request, "panel.html", scan_id=scan_id, stage=stage, rows=stage_rows(stage, failed_stage),
                   titles=scan.reading.titles if scan else [], picks=picks,
                   states=[(states or {}).get(i, PickState()) for i in range(len(picks))],
                   recommendation_id=scan.recommendation_id if scan else None,
                   error=scan.error if scan else None, error_title=FAILED_TITLES.get(failed_stage or ""),
                   note=note, live=live)


def panel_for(request: Request, scan_id: int, scan: Scan | None, states: dict[int, PickState]) -> str:
    if scan is None or not scan.complete:
        return panel(request, scan_id, "uploaded", live=True)
    if scan.failed_stage:
        return panel(request, scan_id, "failed", scan=scan)
    return panel(request, scan_id, "done", scan=scan, states=states)


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


async def _run_stage(scan_id: int, fn: Callable[..., Any], *args) -> AsyncIterator[tuple[str, Any]]:
    """Run a pipeline stage in a worker thread. Yields ("note", text) for each progress note,
    ("keepalive", None) every KEEPALIVE_S while nothing happens, then ("result", value) or
    ("error", message) last."""
    loop = asyncio.get_running_loop()
    notes: asyncio.Queue[str] = asyncio.Queue()
    future = loop.run_in_executor(None, fn, *args, lambda note: loop.call_soon_threadsafe(notes.put_nowait, note))
    next_note = asyncio.ensure_future(notes.get())
    while True:
        done, _ = await asyncio.wait({future, next_note}, return_when=asyncio.FIRST_COMPLETED, timeout=KEEPALIVE_S)
        if next_note in done:
            yield "note", next_note.result()
            next_note = asyncio.ensure_future(notes.get())
        elif future in done:
            break
        else:
            yield "keepalive", None
    next_note.cancel()
    while not notes.empty():
        yield "note", notes.get_nowait()
    try:
        yield "result", future.result()
    except Exception as e:  # the pipeline reports model failures in the row; this is anything else
        log.exception("scan %s: %s raised", scan_id, fn.__name__)
        yield "error", f"{type(e).__name__}: {e}"


async def _stream_stage(request: Request, scan_id: int, stage: str, fn: Callable[..., Any], *args) -> AsyncIterator[Any]:
    """Yield SSE frames while a stage runs; the last item yielded is the stage's result."""
    async for kind, value in _run_stage(scan_id, fn, *args):
        if kind == "note" and value != stage:
            yield sse(stage, panel(request, scan_id, stage, note=value))
        elif kind == "keepalive":
            yield ": keepalive\n\n"
        elif kind == "result":
            yield value
        elif kind == "error":
            yield Reading(error=value) if stage == "reading" else Choosing(error=value)


async def _events(request: Request, photo: dict):
    scan_id = photo["id"]
    session_id = request.state.session_id
    pipeline = _pipeline(request)
    scan = await to_thread.run_sync(pipeline.result, scan_id)

    if scan is None:
        yield sse("uploaded", panel(request, scan_id, "uploaded"))
        yield sse("reading", panel(request, scan_id, "reading"))
        async for item in _stream_stage(request, scan_id, "reading", pipeline.read, photo):
            if isinstance(item, Reading):
                scan = Scan(item)
            else:
                yield item

    assert scan is not None
    if not scan.complete:
        # --- extraction to recommendation handoff. The reading's titles are what the choosing stage
        # is given; a verification step (007) goes between the two here. ---
        yield sse("choosing", panel(request, scan_id, "choosing"))
        prefs = prefs_for_scan(await to_thread.run_sync(pipeline.preferences, session_id))
        async for item in _stream_stage(request, scan_id, "choosing", pipeline.choose, photo, scan.reading, prefs):
            if isinstance(item, Choosing):
                scan = Scan(scan.reading, item)
            else:
                yield item

    if scan.failed_stage:
        log.warning("scan %s: failed at %s: %s", scan_id, scan.failed_stage, scan.error)
        yield sse("failed", panel(request, scan_id, "failed", scan=scan))
    else:
        log.info("scan %s: done, %d titles, %d picks", scan_id, len(scan.reading.titles), len(scan.picks))
        states = await _states(request, scan)
        yield sse("done", panel(request, scan_id, "done", scan=scan, states=states))
    yield sse(CLOSE_EVENT, "")


async def _states(request: Request, scan: Scan) -> dict[int, PickState]:
    if scan.recommendation_id is None:
        return {}
    return await to_thread.run_sync(_pipeline(request).pick_states, request.state.session_id, scan.recommendation_id)


@router.get("/scan/{scan_id}/events")
async def scan_events(scan_id: int, request: Request):
    photo = await _owned_photo(request, scan_id)
    return StreamingResponse(_events(request, photo), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@router.get("/scan/{scan_id}")
async def get_scan(scan_id: int, request: Request):
    await _owned_photo(request, scan_id)
    scan = await to_thread.run_sync(_pipeline(request).result, scan_id)
    states = await _states(request, scan) if scan and scan.complete and not scan.failed_stage else {}
    if _wants_html(request):
        return HTMLResponse(panel_for(request, scan_id, scan, states))
    if scan is None or not scan.complete:
        return JSONResponse({"id": scan_id, "status": "pending"})
    if scan.failed_stage:
        return JSONResponse({"id": scan_id, "status": "failed", "stage": scan.failed_stage, "error": scan.error})
    picks = [{"title": p.title, "reason": p.reason, "saved": states.get(i, PickState()).saved,
              "not_for_me": states.get(i, PickState()).not_for_me} for i, p in enumerate(scan.picks)]
    return JSONResponse({"id": scan_id, "status": "done", "titles": scan.reading.titles,
                         "recommendation_id": scan.recommendation_id, "picks": picks})
