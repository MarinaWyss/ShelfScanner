"""`shelfscanner photos fetch`: rebuild data/photos from the label files (change 006).

Photos are gitignored, so a fresh checkout has labels and no images. This
command makes the two sets that can be rebuilt without Marina:

- ``sourced`` photos are downloaded from ``source.url`` in the label file.
  PNGs are re-encoded as JPEG so every photo is ``<stem>.jpg``.
- ``derived`` photos are regenerated with ``images.degrade`` from the local
  original named in ``derived_from``, using the recorded ``degradation``.

``core`` photos cannot be fetched; they are reported and skipped. Nothing is
overwritten unless ``force`` is set.
"""

from __future__ import annotations

import argparse
import io
import json
from collections.abc import Callable
from pathlib import Path

import httpx
from PIL import Image, ImageOps

from shelfscanner.images import JPEG_QUALITY, degrade
from shelfscanner.settings import LABELS_DIR, PHOTOS_DIR

USER_AGENT = "ShelfScanner/0.1 (https://github.com/MarinaWyss/ShelfScanner)"

Getter = Callable[[str], bytes]


def http_get(url: str) -> bytes:
    """Download one URL. Wikimedia and Openverse providers refuse requests without a real User-Agent."""
    r = httpx.get(url, headers={"User-Agent": USER_AGENT}, follow_redirects=True, timeout=60)
    r.raise_for_status()
    return r.content


def to_jpeg(data: bytes) -> bytes:
    """Re-encode any image (PNG, JPEG) as an upright RGB JPEG with no metadata."""
    with Image.open(io.BytesIO(data)) as im:
        im = ImageOps.exif_transpose(im)
        if im.mode not in ("RGB", "L"):
            im = im.convert("RGB")
        buf = io.BytesIO()
        im.save(buf, format="JPEG", quality=JPEG_QUALITY)
    return buf.getvalue()


def fetch_photos(
    *,
    labels_dir: Path = LABELS_DIR,
    photos_dir: Path = PHOTOS_DIR,
    get: Getter = http_get,
    force: bool = False,
) -> list[str]:
    """Fill `photos_dir` from the label files. Returns a line per label for printing."""
    labels = sorted(labels_dir.glob("*.json"))
    if not labels:
        raise SystemExit(f"No label files in {labels_dir}")
    photos_dir.mkdir(parents=True, exist_ok=True)

    lines: list[str] = []
    # Derived photos need their originals, so fetch sourced first and derive in a second pass.
    pending_derived: list[tuple[str, dict]] = []
    for path in labels:
        raw = json.loads(path.read_text())
        stem, kind = path.stem, raw.get("set", "core")
        target = photos_dir / f"{stem}.jpg"
        if target.exists() and not force:
            lines.append(f"have  {stem}")
            continue
        if kind == "sourced":
            url = raw.get("source", {}).get("url")
            if not url:
                lines.append(f"skip  {stem}: sourced but no source.url")
                continue
            try:
                data = to_jpeg(get(url))
            except Exception as e:  # noqa: BLE001 - one bad URL must not stop the rest
                lines.append(f"fail  {stem}: {e}")
                continue
            target.write_bytes(data)
            lines.append(f"got   {stem}: {len(data) / 1e6:.1f}MB from {url}")
        elif kind == "derived":
            pending_derived.append((stem, raw))
        else:
            lines.append(f"skip  {stem}: core photo, cannot be fetched")

    for stem, raw in pending_derived:
        target = photos_dir / f"{stem}.jpg"
        original = photos_dir / f"{raw.get('derived_from', '')}.jpg"
        degradation = raw.get("degradation") or {}
        if not original.exists() or "kind" not in degradation:
            lines.append(f"skip  {stem}: derived but original {original.name} missing or no degradation recorded")
            continue
        data = degrade(original.read_bytes(), degradation["kind"], **degradation.get("params", {}))
        target.write_bytes(data)
        lines.append(f"made  {stem}: {degradation['kind']} of {original.stem}")
    return lines


def _photos_fetch(args: argparse.Namespace) -> None:
    for line in fetch_photos(force=args.force):
        print(line)


def add_parser(subparsers: argparse._SubParsersAction) -> None:
    """Register `photos fetch` on the `photos` subcommand's subparsers."""
    p = subparsers.add_parser("fetch", help="download sourced photos and regenerate derived ones from the label files")
    p.add_argument("--force", action="store_true", help="re-download and regenerate photos that already exist")
    p.set_defaults(func=_photos_fetch)
