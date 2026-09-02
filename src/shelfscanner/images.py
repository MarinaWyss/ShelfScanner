"""Image handling that never touches the network."""

from __future__ import annotations

import io
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


def has_metadata(data: bytes) -> bool:
    """True if the JPEG bytes still carry an EXIF or XMP block. Used to check strip_metadata."""
    with Image.open(io.BytesIO(data)) as im:
        return bool(im.getexif()) or "xmp" in im.info
