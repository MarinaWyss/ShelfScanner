"""Save and feedback routes (005 task 4): a save or a "not for me" per pick, and the saved list.

Every row joins to the recommendation row that produced the pick (005 D1). A
pick is addressed by its recommendation id and its index in that row's picks;
the recommendation must belong to the device's session or the route is 404.
"""

from __future__ import annotations

from datetime import datetime

from anyio import to_thread
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse

from shelfscanner.web.pipeline import NOT_FOR_ME, Pick, PickState, Pipeline, SavedPick

router = APIRouter()


def _pipeline(request: Request) -> Pipeline:
    return request.app.state.pipeline


def _render(request: Request, name: str, **context) -> str:
    return request.app.state.templates.get_template(name).render(**context)


async def _owned_pick(request: Request, recommendation_id: int, pick_index: int) -> Pick:
    picks = await to_thread.run_sync(_pipeline(request).recommendation, recommendation_id, request.state.session_id)
    if picks is None or not 0 <= pick_index < len(picks):
        raise HTTPException(status_code=404, detail="No such pick for this device")
    return picks[pick_index]


async def _respond(request: Request, recommendation_id: int, pick_index: int):
    states = await to_thread.run_sync(_pipeline(request).pick_states, request.state.session_id, recommendation_id)
    state = states.get(pick_index, PickState())
    if "hx-request" in request.headers:
        return HTMLResponse(_render(request, "pick_actions.html", recommendation_id=recommendation_id,
                                    index=pick_index, state=state))
    return JSONResponse({"recommendation_id": recommendation_id, "pick_index": pick_index,
                         "saved": state.saved, "not_for_me": state.not_for_me})


@router.post("/picks/{recommendation_id}/{pick_index}/save")
async def save_pick(recommendation_id: int, pick_index: int, request: Request):
    await _owned_pick(request, recommendation_id, pick_index)
    await to_thread.run_sync(_pipeline(request).save, request.state.session_id, recommendation_id, pick_index)
    return await _respond(request, recommendation_id, pick_index)


@router.post("/picks/{recommendation_id}/{pick_index}/unsave")
async def unsave_pick(recommendation_id: int, pick_index: int, request: Request):
    await _owned_pick(request, recommendation_id, pick_index)
    await to_thread.run_sync(_pipeline(request).unsave, request.state.session_id, recommendation_id, pick_index)
    return await _respond(request, recommendation_id, pick_index)


@router.post("/picks/{recommendation_id}/{pick_index}/not-for-me")
async def mark_pick(recommendation_id: int, pick_index: int, request: Request):
    await _owned_pick(request, recommendation_id, pick_index)
    await to_thread.run_sync(_pipeline(request).mark, request.state.session_id, recommendation_id, pick_index, NOT_FOR_ME)
    return await _respond(request, recommendation_id, pick_index)


def scan_date(iso: str) -> str:
    """`2026-09-03T12:00:00+00:00` as `3 September 2026`; an unparseable value is shown as given."""
    try:
        return datetime.fromisoformat(iso.replace("Z", "+00:00")).strftime("%-d %B %Y")
    except ValueError:
        return iso


@router.get("/reading-list")
async def saved_list(request: Request):
    saves: list[SavedPick] = await to_thread.run_sync(_pipeline(request).saved, request.state.session_id)
    if "application/json" in request.headers.get("accept", ""):
        return JSONResponse({"saved": [{"recommendation_id": s.recommendation_id, "pick_index": s.pick_index,
                                        "title": s.title, "reason": s.reason, "saved_at": s.saved_at,
                                        "scanned_at": s.scanned_at} for s in saves]})
    items = [{"pick": s, "scanned": scan_date(s.scanned_at)} for s in saves]
    return HTMLResponse(_render(request, "reading_list.html", items=items))


@router.get("/saved")
async def saved_redirect():
    return RedirectResponse("/reading-list", status_code=301)  # the 005 to 012 address
