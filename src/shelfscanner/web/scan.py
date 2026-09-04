"""Scan routes (003, extended by 005 and 008): upload a photo, stream the stages, fetch the result.

A scan is identified by its `photos` row id. Nothing is held in process
between requests, so the same code runs under one uvicorn process on a laptop
and as a Vercel function: `POST /scan` checks the limits and the upload, then
stores the photo; `GET /scan/{id}/events` claims and runs the reading and
choosing stages inside the event stream, with `photos.status` as the lock so a
second connection never runs a model a second time; `GET /scan/{id}` reads the
latest logged extraction and recommendation.
"""

from __future__ import annotations

import asyncio
import io
import logging
from collections.abc import AsyncIterator, Callable
from dataclasses import dataclass
from datetime import datetime
from typing import Annotated, Any

from anyio import to_thread
from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import HTMLResponse, JSONResponse, StreamingResponse
from PIL import Image, UnidentifiedImageError

from shelfscanner.config import load_config
from shelfscanner.images import resize
from shelfscanner.verify import PROGRESS_MESSAGE as CHECKING_NOTE
from shelfscanner.web import limits
from shelfscanner.web.pipeline import Choosing, PickState, Pipeline, Reading, Scan, prefs_for_scan
from shelfscanner.web.render import render as _render
from shelfscanner.web.sessions import client_hash

MAX_BODY_BYTES = 4 * 1024 * 1024
MIN_LONG_EDGE = 400  # px; anything smaller has no legible spines
ALLOWED_TYPES = {"image/jpeg", "image/png"}  # declared content types
# Pillow's format name -> what it is to us. A phone JPEG with an embedded second picture (depth map,
# burst) opens as MPO, and the browser-resize fallback sends exactly those originals.
ALLOWED_FORMATS = {"JPEG": "JPEG", "MPO": "JPEG", "PNG": "PNG"}
KEEPALIVE_S = 15.0
POLL_S = 1.0  # how often a connection that did not get the stage lock looks again
NO_PHOTO = "Choose a photo first."
NO_SESSION = "Open the scanner page first, then choose a photo."  # 017 D2: a cookieless POST is not the form
CLOSE_EVENT = "close"  # sent after done or failed so the browser stops reconnecting

TOO_BIG = ("That photo is over 4 MB. The page shrinks photos before sending when the browser can; "
           "try a smaller photo or a newer browser.")
NOT_AN_IMAGE = "That file is not an image this app can read. Choose a JPEG or PNG."
WRONG_TYPE = "That file is {type}. Choose a JPEG or PNG photo."
TOO_SMALL = ("That photo is {width}×{height} px, too small to read spines from. "
             f"It needs a long edge of at least {MIN_LONG_EDGE} px.")
STORE_FAILED = "Uploading the photo failed. Check the connection and try again."
IN_FLIGHT_NOTE = "Already running for this photo on another connection; waiting for it."

STAGE_LABELS = [("uploaded", "Photo uploaded"), ("reading", "Reading the shelf"), ("checking", "Checking the titles"),
                ("choosing", "Choosing five for you"), ("done", "Picks ready")]
FAILED_TITLES = {"reading": "Reading the shelf failed", "checking": "Checking the titles failed",
                 "choosing": "Choosing failed"}
REFUSAL_TITLES = {"uploading": "Upload refused", "rate": "Scan limit reached", "cap": "Daily budget reached"}
# 017 D5: what the page says when a stage raised (not a model failure, which is in the row); the exception
# itself goes to the log, never to the page.
RAISED = {"reading": "Reading the shelf failed on our side. Try again.",
          "choosing": "Choosing failed on our side. Try again."}

router = APIRouter()
log = logging.getLogger("shelfscanner.web")


@dataclass(frozen=True)
class StageRow:
    name: str
    label: str
    state: str  # todo | active | done | failed


def stage_rows(stage: str, failed_stage: str | None = None) -> list[StageRow]:
    """One row per progress stage, given the scan's current stage (uploaded, reading, checking, choosing,
    done, failed) and, when failed, the stage that failed."""
    names = [name for name, _ in STAGE_LABELS]
    if stage == "done":
        completed, current = len(names), None
    elif stage == "failed":
        completed, current = names.index(failed_stage or "reading"), "failed"
    elif stage == "uploaded":
        completed, current = 1, None
    else:  # reading, checking or choosing, in progress
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


def _now(request: Request) -> datetime:
    return request.app.state.clock()


def _wants_html(request: Request) -> bool:
    return "hx-request" in request.headers


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
                   failed_stage=failed_stage, note=note, live=live)


def panel_for(request: Request, scan_id: int, scan: Scan | None, states: dict[int, PickState]) -> str:
    if scan is None or not scan.complete:
        return panel(request, scan_id, "uploaded", live=True)
    if scan.failed_stage:
        return panel(request, scan_id, "failed", scan=scan)
    return panel(request, scan_id, "done", scan=scan, states=states)


def _refuse(request: Request, status: int, message: str, stage: str, *, retry: bool = False):
    """A refusal before any stage ran. `stage` is `uploading` for a bad upload or a store failure, `rate`
    or `cap` for a limit; it is what the JSON and the fragment's `data-stage` carry."""
    if _wants_html(request):
        return HTMLResponse(_render(request, "error.html", message=message, stage=stage, title=REFUSAL_TITLES[stage],
                                    retry=retry), status_code=status)
    return JSONResponse({"error": message, "stage": stage}, status_code=status)


def inspect_upload(content_type: str | None, data: bytes) -> str | None:
    """The refusal message for an upload that is not a JPEG or PNG of a readable size, or None when it
    passes. Reads the header only; the pixels are decoded once, by `resize`, afterwards."""
    declared = (content_type or "").split(";")[0].strip().lower()
    if declared not in ALLOWED_TYPES:
        return WRONG_TYPE.format(type=declared or "of an unknown type")
    try:
        with Image.open(io.BytesIO(data)) as im:
            fmt, width, height = im.format, im.width, im.height
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError, ValueError):
        return NOT_AN_IMAGE
    if fmt not in ALLOWED_FORMATS:
        return WRONG_TYPE.format(type=f"a {fmt}" if fmt else "of an unknown type")
    if max(width, height) < MIN_LONG_EDGE:  # the long edge is the same whichever way the orientation tag turns it
        return TOO_SMALL.format(width=width, height=height)
    return None


@router.post("/scan")
async def create_scan(request: Request, photo: Annotated[UploadFile | None, File()] = None,
                      resized: Annotated[str, Form()] = "0"):
    session_id = request.state.session_id
    pipeline = _pipeline(request)
    if session_id is None:
        # 017 D2: the middleware made no session for a cookieless POST /scan; the form always has one.
        log.info("scan: cookieless upload refused")
        return _refuse(request, 400, NO_SESSION, "uploading")
    if photo is None or not photo.filename:
        # 012: iOS Safari submits a form with an empty `required` file input without a word; say one.
        return _refuse(request, 400, NO_PHOTO, "uploading")
    length = request.headers.get("content-length", "")
    if length.isdigit() and int(length) > MAX_BODY_BYTES:
        return _refuse(request, 413, TOO_BIG, "uploading")

    # 008: the limits, before anything is read or stored (D1: refused with the number). 017 D1: the
    # address counts too, as a hash of where the upload came from.
    address = client_hash(request.scope)
    refusal = await to_thread.run_sync(limits.check, pipeline, session_id, request.app.state.limits, _now(request),
                                       address)
    if refusal is not None:
        log.info("scan: session %s refused (%s): %s", session_id, refusal.kind, refusal.message)
        return _refuse(request, refusal.status, refusal.message, refusal.kind)

    # Read at most one byte over the limit (017): `Content-Length` above is advisory, a chunked body has none.
    data = await photo.read(MAX_BODY_BYTES + 1)
    if len(data) > MAX_BODY_BYTES:
        return _refuse(request, 413, TOO_BIG, "uploading")
    problem = inspect_upload(photo.content_type, data)
    if problem is not None:
        return _refuse(request, 400, problem, "uploading")
    resized_by_client = resized == "1"
    if not resized_by_client:
        log.info("scan: session %s sent the original file (%d bytes); resizing on the server", session_id, len(data))

    try:
        img = await to_thread.run_sync(resize, data, load_config().default_max_edge)
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError, ValueError):
        return _refuse(request, 400, NOT_AN_IMAGE, "uploading")

    try:
        row = await to_thread.run_sync(lambda: pipeline.store(session_id, img.jpeg, resized_by_client=resized_by_client,
                                                              client_hash=address))
    except Exception:
        log.exception("scan: storing the photo for session %s failed", session_id)
        return _refuse(request, 500, STORE_FAILED, "uploading", retry=True)

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
    ("error", None) last; the exception is logged, and the caller says the fixed sentence (017 D5)."""
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
    except (Exception, SystemExit):  # model failures are in the row; this is anything else, and a
        # SystemExit (the CLI-shaped failure) must never reach the event loop, which would exit the server
        log.exception("scan %s: %s raised", scan_id, fn.__name__)
        yield "error", None


# --- the stage runners (008). Each runs in the worker thread and writes the status the stage leaves
# behind, so the row is right even when the browser has gone before the stage finished. ---


def read_marked(pipeline: Pipeline, photo: dict, clock: Callable[[], datetime], on_progress) -> Reading:
    """Run the reading; leave `failed`, `done` (nothing read) or `reading` (titles read, choosing not
    yet claimed). An exception puts the scan back to `pending` so a reconnect can try again."""
    try:
        reading = pipeline.read(photo, on_progress)
    except (Exception, SystemExit):
        pipeline.set_status(photo["id"], "pending", clock())
        raise
    if not reading.ok:
        pipeline.set_status(photo["id"], "failed", clock())
    elif not reading.titles:
        pipeline.set_status(photo["id"], "done", clock())
    return reading


def choose_marked(pipeline: Pipeline, photo: dict, reading: Reading, prefs: dict, clock: Callable[[], datetime],
                  on_progress) -> Choosing:
    """Run the choosing; leave `done` or `failed`. An exception puts the scan back to `reading` (the
    reading is done, the choosing is not) so a reconnect can try the choosing again."""
    try:
        choosing = pipeline.choose(photo, reading, prefs, on_progress)
    except (Exception, SystemExit):
        pipeline.set_status(photo["id"], "reading", clock())
        raise
    pipeline.set_status(photo["id"], "done" if choosing.ok else "failed", clock())
    return choosing


async def _reading(request: Request, photo: dict) -> AsyncIterator[Any]:
    """Frames for the reading stage; the last item yielded is the `Reading`."""
    scan_id = photo["id"]
    yield sse("uploaded", panel(request, scan_id, "uploaded"))
    yield sse("reading", panel(request, scan_id, "reading"))
    async for kind, value in _run_stage(scan_id, read_marked, _pipeline(request), photo, request.app.state.clock):
        if kind == "note" and value != "reading":
            yield sse("reading", panel(request, scan_id, "reading", note=value))
        elif kind == "keepalive":
            yield ": keepalive\n\n"
        elif kind == "result":
            yield value
        elif kind == "error":
            yield Reading(error=RAISED["reading"], verbatim=True)


async def _choosing(request: Request, photo: dict, reading: Reading) -> AsyncIterator[Any]:
    """Frames for the choosing stage, which checks the titles first (007): the panel shows `checking`
    until the first note that is not the check's, then `choosing`. The last item is the `Choosing`."""
    scan_id = photo["id"]
    pipeline = _pipeline(request)
    step = "checking"
    yield sse(step, panel(request, scan_id, step))
    prefs = prefs_for_scan(await to_thread.run_sync(pipeline.preferences, request.state.session_id))
    async for kind, value in _run_stage(scan_id, choose_marked, pipeline, photo, reading, prefs, request.app.state.clock):
        if kind == "note":
            if value == CHECKING_NOTE:
                continue
            step = "choosing"
            yield sse(step, panel(request, scan_id, step, note=None if value == "choosing" else value))
        elif kind == "keepalive":
            yield ": keepalive\n\n"
        elif kind == "result":
            yield value
        elif kind == "error":
            yield Choosing(error=RAISED["choosing"], verbatim=True)


async def _events(request: Request, photo: dict):
    scan_id = photo["id"]
    pipeline = _pipeline(request)
    clock = request.app.state.clock
    scan = await to_thread.run_sync(pipeline.result, scan_id)
    waiting: str | None = None  # the stage another connection is running, once announced
    waited = 0.0

    while scan is None or not scan.complete:
        stage = "reading" if scan is None else "choosing"
        if await to_thread.run_sync(pipeline.claim, scan_id, stage, clock()):
            if stage == "reading":
                async for item in _reading(request, photo):
                    if isinstance(item, Reading):
                        scan = Scan(item)
                    else:
                        yield item
            else:
                # --- extraction to recommendation handoff. The reading's titles are what the choosing stage
                # is given; the catalogue check (007) runs first, inside the pipeline's choosing. ---
                async for item in _choosing(request, photo, scan.reading):
                    if isinstance(item, Choosing):
                        scan = Scan(scan.reading, item)
                    else:
                        yield item
            waiting = None
            continue
        # 008: another connection holds this stage. Show it, then look again until it finishes or its
        # claim goes stale (STALE_CLAIM_S), when the claim above succeeds and this connection runs it.
        if waiting != stage:
            log.info("scan %s: %s already in flight on another connection; waiting", scan_id, stage)
            yield sse(stage, panel(request, scan_id, stage, note=IN_FLIGHT_NOTE))
            waiting, waited = stage, 0.0
        await asyncio.sleep(POLL_S)
        waited += POLL_S
        if waited >= KEEPALIVE_S:
            yield ": keepalive\n\n"
            waited = 0.0
        scan = await to_thread.run_sync(pipeline.result, scan_id)

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
