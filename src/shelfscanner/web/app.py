"""The ASGI app (003, 005). `app` is what uvicorn and Vercel import; `create_app` is the seam.

    uv run uvicorn shelfscanner.web.app:app --host 0.0.0.0 --port 8000

With SHELFSCANNER_FAKE_PIPELINE=1 the app runs entirely in memory: no Supabase
project, no provider key, fixed titles and picks. That is what the Playwright suite drives.
"""

from __future__ import annotations

import os
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path

from anyio import to_thread
from fastapi import FastAPI, Request
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from jinja2 import Environment, FileSystemLoader, select_autoescape

from shelfscanner.web import picks, prefs, scan
from shelfscanner.web.limits import Limits
from shelfscanner.web.limits import from_env as limits_from_env
from shelfscanner.web.pipeline import Pipeline
from shelfscanner.web.sessions import SessionMiddleware, SessionStore

WEB_DIR = Path(__file__).resolve().parent
TEMPLATES_DIR = WEB_DIR / "templates"
STATIC_DIR = WEB_DIR / "static"
FAKE_ENV = "SHELFSCANNER_FAKE_PIPELINE"


def use_fakes() -> bool:
    return os.environ.get(FAKE_ENV) == "1"


def create_app(*, pipeline: Pipeline | None = None, sessions: SessionStore | None = None,
               limits: Limits | None = None, clock: Callable[[], datetime] | None = None) -> FastAPI:
    if pipeline is None or sessions is None:
        if use_fakes():
            from shelfscanner.web.fakes import FakePipeline, MemorySessions

            pipeline = pipeline or FakePipeline()
            sessions = sessions or MemorySessions()
        else:
            from shelfscanner.web.pipeline import SupabasePipeline
            from shelfscanner.web.sessions import SupabaseSessions

            pipeline = pipeline or SupabasePipeline()
            sessions = sessions or SupabaseSessions()

    app = FastAPI(title="ShelfScanner", docs_url=None, redoc_url=None)
    app.state.pipeline = pipeline
    env = Environment(loader=FileSystemLoader(TEMPLATES_DIR), autoescape=select_autoescape(["html"]),
                      trim_blocks=True, lstrip_blocks=True)
    env.globals["year"] = datetime.now(UTC).year  # the footer's copyright line (014)
    app.state.templates = Jinja2Templates(env=env)
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
    app.include_router(scan.router)
    app.include_router(prefs.router)
    app.include_router(picks.router)
    # --- change 008 ---
    # The scan limits and the clock the scan routes read them by (tests pass a fixed clock).
    app.state.limits = limits or limits_from_env()
    app.state.clock = clock or (lambda: datetime.now(UTC))
    # --- end change 008 ---
    # --- change 009 ---
    from shelfscanner.web import admin, metrics

    app.include_router(admin.router)
    app.state.metrics_source = metrics.source_for(pipeline)  # the fake's rows in memory, or the tables
    # --- end change 009 ---
    app.add_middleware(SessionMiddleware, store=sessions, routes=app.router.routes)

    @app.get("/")
    async def home(request: Request):
        # 012: what the app does, for a visitor. Unsessioned (sessions.UNSESSIONED_PATHS): no row, no cookie.
        return app.state.templates.TemplateResponse(request, "home.html")

    # 014: the Book Scanner is the v1 flow, three steps on one page: /books is step 1 (preferences,
    # prefilled from the row), /books/upload is step 2 (the photo), and the recommendations replace
    # step 2 in place. Step 2 without a preferences row goes back to step 1 (005: the first visit
    # sees the preferences first).
    @app.get("/books")
    async def books_page(request: Request):
        return await prefs.preferences_page(request)

    @app.get("/books/upload")
    async def upload_page(request: Request):
        stored = await to_thread.run_sync(pipeline.preferences, request.state.session_id)
        if stored is None:
            return RedirectResponse("/books", status_code=302)
        return app.state.templates.TemplateResponse(request, "upload.html", {"step": 2})

    @app.get("/scan")
    async def scan_page():
        return RedirectResponse("/books/upload", status_code=301)  # the 003 to 012 address

    return app


app = create_app()
