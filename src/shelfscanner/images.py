"""Image handling that never touches the network."""

from __future__ import annotations

import io
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageOps

JPEG_QUALITY = 95


def strip_metadata(path: Path) -> bytes:
    """Return the image as JPEG bytes with EXIF and XMP removed.

    Phone cameras write GPS coordinates into EXIF, so this runs before any
    byte leaves the machine. The EXIF orientation tag is applied to the pixels
    first, so dropping it cannot flip the image. The ICC colour profile is
    kept; it carries no location or device data.
    """
    with Image.open(path) as im:
        im = ImageOps.exif_transpose(im)
        if im.mode not in ("RGB", "L"):
            im = im.convert("RGB")
        icc = im.info.get("icc_profile")
        buf = io.BytesIO()
        # Pillow only writes EXIF/XMP when passed explicitly, so omitting them here drops both.
        im.save(buf, format="JPEG", quality=JPEG_QUALITY, icc_profile=icc)
    return buf.getvalue()


@dataclass(frozen=True)
class Resized:
    jpeg: bytes
    width: int
    height: int


def resize(data: bytes, max_edge: int) -> Resized:
    """Shrink so the long edge is at most `max_edge` px (proposal D7). Never upscales.

    Returns JPEG bytes without metadata plus the dimensions actually sent, so
    they can be logged next to the requested long edge.
    """
    with Image.open(io.BytesIO(data)) as im:
        im = ImageOps.exif_transpose(im)
        if im.mode not in ("RGB", "L"):
            im = im.convert("RGB")
        long_edge = max(im.size)
        if long_edge > max_edge:
            scale = max_edge / long_edge
            im = im.resize((round(im.width * scale), round(im.height * scale)), Image.Resampling.LANCZOS)
        buf = io.BytesIO()
        im.save(buf, format="JPEG", quality=JPEG_QUALITY)
        return Resized(buf.getvalue(), im.width, im.height)


def has_metadata(data: bytes) -> bool:
    """True if the JPEG bytes still carry an EXIF or XMP block. Used to check strip_metadata."""
    with Image.open(io.BytesIO(data)) as im:
        return bool(im.getexif()) or "xmp" in im.info
