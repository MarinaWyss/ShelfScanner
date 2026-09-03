"""The preferences page (005 task 2): genre picks, a line of free text, an optional Goodreads export.

Writes the preferences object through 004's importer to the session's row. The
export is parsed from the request body in memory and never written anywhere
(scoping R4); only the object built from it is stored. The page is shown on
the first visit (no row yet) and is reachable from the scan page after that.
"""

from __future__ import annotations

import io
from typing import Annotated

from anyio import to_thread
from fastapi import APIRouter, File, Form, Request, UploadFile
from fastapi.responses import HTMLResponse, RedirectResponse

from shelfscanner import preferences
from shelfscanner.web.pipeline import Pipeline

# 012 D4: the original ShelfScanner's eighteen, verbatim.
GENRES = ["Fiction", "Non-Fiction", "Business", "Design", "Self-Help", "Science", "Mystery", "Romance", "Fantasy",
          "Science Fiction", "Biography", "History", "Young Adult", "Thriller", "Horror", "Poetry", "Classics", "Comics"]
MAX_EXPORT_BYTES = 4 * 1024 * 1024  # the scan route's limit; a Goodreads export is usually under 1 MB
EXPORT_TOO_BIG = "That file is over 4 MB. A Goodreads export is usually well under 1 MB; check you picked the CSV."
NOT_AN_EXPORT = ("That file is not a Goodreads export. In Goodreads, open My Books, choose Import and export, "
                 "then Export library, and upload the CSV it gives you.")

router = APIRouter()


def _pipeline(request: Request) -> Pipeline:
    return request.app.state.pipeline


def _render(request: Request, name: str, **context) -> str:
    return request.app.state.templates.get_template(name).render(**context)


def import_note(prefs: dict) -> str | None:
    """What the stored object holds from an export, for the page to say so."""
    rated, to_read = len(prefs.get("rated_books", [])), len(prefs.get("to_read", []))
    if not rated and not to_read:
        return None
    return f"{rated} rated books and {to_read} to-read titles are on file from your export. Upload again to replace them."


def split_authors(text: str) -> list[str]:
    """The authors field (012 D2): comma-separated, trimmed, empties dropped, first spelling of a repeat kept."""
    out: list[str] = []
    for name in text.replace("\n", ",").split(","):
        name = " ".join(name.split())
        if name and name.casefold() not in {o.casefold() for o in out}:
            out.append(name)
    return out


def build_object(existing: dict | None, genres: list[str], free_text: str, export: str | None,
                 name: str = "the upload", authors: str = "") -> dict:
    """The object to store. With an export, its rows replace the rated, to-read and avoid lists (the avoid
    entries are the export's did-not-finish books); without one, those lists stay as they were."""
    genres = [g for g in genres if g.strip()]
    free_text = free_text.strip()
    author_list = split_authors(authors)
    if export is not None:
        rows = preferences.rows_from_export(io.StringIO(export, newline=""), name=name)
        return preferences.build(rows, genres=genres, free_text=free_text, authors=author_list)
    base = preferences.upgrade(existing) if existing else preferences.empty()
    return {**base, "genres": genres, "free_text": free_text, "authors": author_list}


def _page(request: Request, prefs: dict | None, *, error: str | None = None, status: int = 200) -> HTMLResponse:
    obj = preferences.upgrade(prefs) if prefs else preferences.empty()
    chosen = set(obj["genres"])
    # A stored genre that is not on the list (an older list, the CLI) stays chosen and gets its own chip.
    genres = GENRES + [g for g in obj["genres"] if g not in GENRES]
    return HTMLResponse(_render(request, "preferences.html", genres=genres, chosen=chosen,
                                free_text=obj["free_text"], authors=", ".join(obj["authors"]),
                                import_note=import_note(obj), first=prefs is None, error=error), status_code=status)


@router.get("/preferences")
async def preferences_page(request: Request):
    prefs = await to_thread.run_sync(_pipeline(request).preferences, request.state.session_id)
    return _page(request, prefs)


@router.post("/preferences")
async def save_preferences(request: Request, genres: Annotated[list[str], Form()] = [],  # noqa: B006 - FastAPI reads the default
                           free_text: Annotated[str, Form()] = "", action: Annotated[str, Form()] = "save",
                           authors: Annotated[str, Form()] = "",
                           goodreads: Annotated[UploadFile | None, File()] = None):
    session_id = request.state.session_id
    pipeline = _pipeline(request)
    existing = await to_thread.run_sync(pipeline.preferences, session_id)
    if action == "skip":
        # A skipped first visit still gets a row, so the page is not shown again (005 D2).
        prefs = preferences.upgrade(existing) if existing else preferences.empty()
    else:
        export = None
        if goodreads is not None and goodreads.filename:
            data = await goodreads.read(MAX_EXPORT_BYTES + 1)
            if len(data) > MAX_EXPORT_BYTES:
                return _page(request, existing, error=EXPORT_TOO_BIG, status=413)
            if data:
                export = data.decode("utf-8-sig", errors="replace")
        try:
            prefs = build_object(existing, genres, free_text, export, name=goodreads.filename if goodreads else "",
                                 authors=authors)
        except SystemExit:
            return _page(request, existing, error=NOT_AN_EXPORT, status=400)
    await to_thread.run_sync(pipeline.save_preferences, session_id, prefs)
    return RedirectResponse("/scan", status_code=303)
