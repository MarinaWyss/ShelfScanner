"""Vercel entry point (003 D4; deployment is change 010).

Vercel's Python runtime looks for a FastAPI instance named `app` in an `index`
(or `app`, `main`, `server`, ...) file at the repo root or under `api/`, `src/`
or `app/`, and routes every request to it (vercel.com/kb/guide/ship-a-fastapi-app-on-vercel).
The real app lives in the pipeline package; this file only re-exports it.
Locally, run `uv run uvicorn shelfscanner.web.app:app` instead.
"""

try:
    from shelfscanner.web.app import app
except ModuleNotFoundError:  # the package was not installed into the build's environment
    import sys
    from pathlib import Path

    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
    from shelfscanner.web.app import app

__all__ = ["app"]
