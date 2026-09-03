"""Vercel entry point (change 010; laid out in 003 D4).

Vercel's FastAPI preset looks for a FastAPI instance named `app` in an `index.py`
(or `app.py`, `main.py`, `server.py`) at the repository root or under `src/` or
`app/`, and routes every request to it (vercel.com/docs/frameworks/backend/fastapi).
The real app lives in the pipeline package; this file only re-exports it.

`src/` goes to the front of the path on purpose: the package must be imported
from the checkout, not from a copy the build installed elsewhere, because
`settings.REPO_ROOT` is derived from the package's location and `config/` and
`prompts/` are read relative to it. Locally, run
`uv run uvicorn shelfscanner.web.app:app` instead.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "src"))

from shelfscanner.web.app import app  # noqa: E402

__all__ = ["app"]
