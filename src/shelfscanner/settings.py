"""Environment and repository paths.

Loaded once from the project's .env; nothing here talks to the network.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = REPO_ROOT / "data"
PHOTOS_DIR = DATA_DIR / "photos"  # gitignored; may show private rooms
LABELS_DIR = DATA_DIR / "labels"

PHOTO_BUCKET = "shelf-photos"
PHOTO_EXTENSIONS = (".jpg", ".jpeg", ".png")


@dataclass(frozen=True)
class Settings:
    supabase_url: str
    supabase_secret_key: str


def _require(*keys: str) -> list[str]:
    load_dotenv(REPO_ROOT / ".env")
    missing = [k for k in keys if not os.environ.get(k)]
    if missing:
        raise SystemExit(f"Missing in .env: {', '.join(missing)} (see .env.example)")
    return [os.environ[k] for k in keys]


def load_settings() -> Settings:
    url, key = _require("SUPABASE_URL", "SUPABASE_SECRET_KEY")
    return Settings(supabase_url=url, supabase_secret_key=key)


def openrouter_api_key() -> str:
    return _require("OPENROUTER_API_KEY")[0]
