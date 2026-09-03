"""Photos in the private bucket and their rows in the `photos` table.

A photo's identity is its file stem (e.g. PXL_20250519_214502479). The label
file is data/labels/<stem>.json, the local image is data/photos/<stem>.<ext>,
and the object in the bucket is <stem>.jpg. `storage_path` on the row is that
object key, and it is the upsert key.
"""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass
from pathlib import Path

from shelfscanner.db import get_client
from shelfscanner.images import has_metadata, strip_metadata
from shelfscanner.settings import LABELS_DIR, PHOTO_BUCKET, PHOTO_EXTENSIONS, PHOTOS_DIR


@dataclass(frozen=True)
class Label:
    stem: str
    titles: list[str]
    partial: list[str]
    notes: str | None

    @property
    def storage_path(self) -> str:
        return f"{self.stem}.jpg"


def read_label(path: Path) -> Label:
    raw = json.loads(path.read_text())
    return Label(
        stem=path.stem,
        titles=list(raw["titles"]),
        partial=list(raw.get("partial", [])),
        notes=raw.get("notes"),
    )


def local_photo_for(stem: str) -> Path | None:
    for ext in PHOTO_EXTENSIONS:
        p = PHOTOS_DIR / f"{stem}{ext}"
        if p.exists():
            return p
    return None


def upload_photo(local: Path, storage_path: str) -> int:
    """Strip metadata and upload, overwriting any existing object. Returns bytes sent."""
    data = strip_metadata(local)
    if has_metadata(data):
        raise RuntimeError(f"{local.name}: metadata survived stripping; refusing to upload")
    get_client().storage.from_(PHOTO_BUCKET).upload(
        storage_path,
        data,
        {"content-type": "image/jpeg", "upsert": "true"},
    )
    return len(data)


def upsert_photo_row(label: Label) -> dict:
    row = {
        "storage_path": label.storage_path,
        "titles": label.titles,
        "partial_titles": label.partial,
        "notes": label.notes,
    }
    res = (
        get_client()
        .table("photos")
        .upsert(row, on_conflict="storage_path")
        .execute()
    )
    return res.data[0]


PHOTO_COLUMNS = "id, storage_path, titles, partial_titles, notes, created_at"


def list_photos() -> list[dict]:
    res = get_client().table("photos").select(PHOTO_COLUMNS).order("id").execute()
    return res.data


def get_photo(photo_id: int) -> dict:
    res = get_client().table("photos").select(PHOTO_COLUMNS).eq("id", photo_id).execute()
    if not res.data:
        raise SystemExit(f"No photo with id {photo_id}")
    return res.data[0]


def download_photo(storage_path: str) -> bytes:
    return get_client().storage.from_(PHOTO_BUCKET).download(storage_path)


def sync_photos() -> list[str]:
    """Upload every labelled photo and upsert its row. Returns a line per photo for printing."""
    labels = sorted(LABELS_DIR.glob("*.json"))
    if not labels:
        raise SystemExit(f"No label files in {LABELS_DIR}")

    lines: list[str] = []
    for label_path in labels:
        label = read_label(label_path)
        local = local_photo_for(label.stem)
        if local is None:
            lines.append(f"skip  {label.stem}: no photo in {PHOTOS_DIR}")
            continue
        sent = upload_photo(local, label.storage_path)
        row = upsert_photo_row(label)
        lines.append(
            f"ok    {label.stem}: id={row['id']} titles={len(label.titles)} "
            f"partial={len(label.partial)} uploaded={sent / 1e6:.1f}MB"
        )

    unlabelled = sorted(
        p.stem for p in PHOTOS_DIR.iterdir()
        if p.suffix.lower() in PHOTO_EXTENSIONS and not (LABELS_DIR / f"{p.stem}.json").exists()
    ) if PHOTOS_DIR.exists() else []
    for stem in unlabelled:
        lines.append(f"skip  {stem}: photo has no label file")
    return lines


# --- change 003 ---
# Photos a device scans from the web app: stored under sessions/<id>/ in the
# same bucket, with a `photos` row that carries the session and no labels.

SESSION_PHOTO_COLUMNS = PHOTO_COLUMNS + ", session_id"


def store_session_photo(session_id: int, jpeg: bytes) -> dict:
    """Upload stripped JPEG bytes for a session and insert the unlabelled `photos` row.

    The caller has already resized and re-encoded (see `images.resize`); this
    refuses if any metadata survived, uploads to a fresh key so nothing is ever
    overwritten, and returns the inserted row.
    """
    if has_metadata(jpeg):
        raise RuntimeError("metadata survived stripping; refusing to upload")
    storage_path = f"sessions/{session_id}/{uuid.uuid4().hex}.jpg"
    get_client().storage.from_(PHOTO_BUCKET).upload(storage_path, jpeg, {"content-type": "image/jpeg"})
    row = {"storage_path": storage_path, "session_id": session_id}
    return get_client().table("photos").insert(row).execute().data[0]


def get_session_photo(photo_id: int, session_id: int) -> dict | None:
    """The photo row if it exists and belongs to the session; None otherwise."""
    res = (
        get_client()
        .table("photos")
        .select(SESSION_PHOTO_COLUMNS)
        .eq("id", photo_id)
        .eq("session_id", session_id)
        .execute()
    )
    return res.data[0] if res.data else None


# --- change 006 ---
# Label files may carry `set`, `provisional` and `source` (docs/specs/photo-storage.md).
# `sync_photos` sends them when present, so the photos table can tell the sets apart.
# The columns arrive with migration 20260903004500_photo_sets.sql.


def read_label_extras(path: Path) -> dict:
    """The 006 keys of a label file as row columns; absent keys are left to the column defaults."""
    raw = json.loads(path.read_text())
    extras: dict = {}
    if "set" in raw:
        extras["set"] = raw["set"]
    if "provisional" in raw:
        extras["provisional"] = bool(raw["provisional"])
    if raw.get("source") is not None:
        extras["source"] = raw["source"]
    return extras


def upsert_photo_row_with_extras(label: Label, extras: dict) -> dict:
    row = {
        "storage_path": label.storage_path,
        "titles": label.titles,
        "partial_titles": label.partial,
        "notes": label.notes,
        **extras,
    }
    res = get_client().table("photos").upsert(row, on_conflict="storage_path").execute()
    return res.data[0]


def _sync_photos_006() -> list[str]:
    labels = sorted(LABELS_DIR.glob("*.json"))
    if not labels:
        raise SystemExit(f"No label files in {LABELS_DIR}")

    lines: list[str] = []
    for label_path in labels:
        label = read_label(label_path)
        extras = read_label_extras(label_path)
        local = local_photo_for(label.stem)
        if local is None:
            lines.append(f"skip  {label.stem}: no photo in {PHOTOS_DIR}")
            continue
        sent = upload_photo(local, label.storage_path)
        row = upsert_photo_row_with_extras(label, extras)
        lines.append(
            f"ok    {label.stem}: id={row['id']} set={extras.get('set', 'core')} titles={len(label.titles)} "
            f"partial={len(label.partial)} uploaded={sent / 1e6:.1f}MB"
        )

    unlabelled = sorted(
        p.stem for p in PHOTOS_DIR.iterdir()
        if p.suffix.lower() in PHOTO_EXTENSIONS and not (LABELS_DIR / f"{p.stem}.json").exists()
    ) if PHOTOS_DIR.exists() else []
    for stem in unlabelled:
        lines.append(f"skip  {stem}: photo has no label file")
    return lines


sync_photos = _sync_photos_006  # noqa: F811 - the 006 version replaces the original on import
PHOTO_COLUMNS = PHOTO_COLUMNS + ", set, provisional, source"
