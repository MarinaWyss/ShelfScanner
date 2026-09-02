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


def load_settings() -> Settings:
    load_dotenv(REPO_ROOT / ".env")
    missing = [k for k in ("SUPABASE_URL", "SUPABASE_SECRET_KEY") if not os.environ.get(k)]
    if missing:
        raise SystemExit(f"Missing in .env: {', '.join(missing)} (see .env.example)")
    return Settings(
        supabase_url=os.environ["SUPABASE_URL"],
        supabase_secret_key=os.environ["SUPABASE_SECRET_KEY"],
    )
