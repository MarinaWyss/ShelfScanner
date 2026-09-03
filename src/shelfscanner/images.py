"""Image handling that never touches the network."""

from __future__ import annotations

import io
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageFilter, ImageOps

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


DEGRADATIONS = ("blur", "glare", "rotate", "small")


def degrade(jpeg: bytes, kind: str, **params) -> bytes:
    """Return a degraded copy of a JPEG, for the derived test set (change 006).

    Kinds and their parameters:
    - ``blur``: gaussian blur, ``radius`` in px (default 3).
    - ``glare``: a soft white gradient from one corner, ``alpha`` 0..1 for the
      strength at the corner (default 0.85), ``corner`` one of ``tl tr bl br``.
    - ``rotate``: ``degrees`` counter-clockwise (default 7); the canvas expands
      so nothing is cropped and the corners are filled with ``fill``.
    - ``small``: shrink so the long edge is ``max_edge`` px (default 1024).

    Output is a metadata-free JPEG at the usual quality.
    """
    if kind not in DEGRADATIONS:
        raise ValueError(f"unknown degradation {kind!r}; expected one of {DEGRADATIONS}")
    with Image.open(io.BytesIO(jpeg)) as src:
        im = ImageOps.exif_transpose(src).convert("RGB")
    if kind == "blur":
        im = im.filter(ImageFilter.GaussianBlur(radius=float(params.get("radius", 3))))
    elif kind == "glare":
        im = _glare(im, float(params.get("alpha", 0.85)), str(params.get("corner", "tr")))
    elif kind == "rotate":
        fill = params.get("fill", (0, 0, 0))
        im = im.rotate(float(params.get("degrees", 7)), resample=Image.Resampling.BICUBIC, expand=True, fillcolor=fill)
    elif kind == "small":
        return resize(jpeg, int(params.get("max_edge", 1024))).jpeg
    buf = io.BytesIO()
    im.save(buf, format="JPEG", quality=JPEG_QUALITY)
    return buf.getvalue()


def _glare(im: Image.Image, alpha: float, corner: str) -> Image.Image:
    """Blend white into the image with a radial falloff from one corner.

    The falloff reaches zero at about 1.1 times the image's long edge, so
    the far corner is untouched and the near corner is nearly blown out, like
    a window reflection on glossy spines.
    """
    if corner not in ("tl", "tr", "bl", "br"):
        raise ValueError(f"corner must be one of tl tr bl br, got {corner!r}")
    w, h = im.size
    # Build the mask small and upscale: a per-pixel loop at photo size is slow.
    mw, mh = 256, max(1, round(256 * h / w))
    cx = 0 if corner[1] == "l" else mw - 1
    cy = 0 if corner[0] == "t" else mh - 1
    reach = 1.1 * max(mw, mh)
    mask = Image.new("L", (mw, mh))
    px = mask.load()
    for y in range(mh):
        for x in range(mw):
            d = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5 / reach
            v = max(0.0, 1.0 - d) ** 1.5 * alpha
            px[x, y] = round(255 * v)
    mask = mask.resize((w, h), Image.Resampling.BILINEAR)
    white = Image.new("RGB", (w, h), (255, 255, 255))
    return Image.composite(white, im, mask)
