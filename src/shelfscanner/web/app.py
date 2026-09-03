"""The ASGI app (003). `app` is what uvicorn and Vercel import; `create_app` is the seam.

    uv run uvicorn shelfscanner.web.app:app --host 0.0.0.0 --port 8000

With SHELFSCANNER_FAKE_PIPELINE=1 the app runs entirely in memory: no Supabase
project, no provider key, fixed titles. That is what the Playwright suite drives.
"""

from __future__ import annotations

import os
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from jinja2 import Environment, FileSystemLoader, select_autoescape

from shelfscanner.web import scan
from shelfscanner.web.pipeline import Pipeline
from shelfscanner.web.sessions import SessionMiddleware, SessionStore

WEB_DIR = Path(__file__).resolve().parent
TEMPLATES_DIR = WEB_DIR / "templates"
STATIC_DIR = WEB_DIR / "static"
FAKE_ENV = "SHELFSCANNER_FAKE_PIPELINE"


def use_fakes() -> bool:
    return os.environ.get(FAKE_ENV) == "1"


def create_app(*, pipeline: Pipeline | None = None, sessions: SessionStore | None = None) -> FastAPI:
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
    app.state.templates = Jinja2Templates(env=env)
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
    app.include_router(scan.router)
    app.add_middleware(SessionMiddleware, store=sessions)

    @app.get("/")
    async def index(request: Request):
        return app.state.templates.TemplateResponse(request, "index.html")

    return app


app = create_app()
