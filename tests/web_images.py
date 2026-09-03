"""Test photos built in memory for the web tests (003), so nothing depends on data/photos."""

from __future__ import annotations

import io
import random

from PIL import Image, ImageDraw
from PIL.TiffImagePlugin import IFDRational

ORIENTATION = 0x0112
GPS_IFD = 0x8825
ROTATE_90_CW = 6


def shelf_image(width: int = 4000, height: int = 3000) -> Image.Image:
    """Something that compresses like a photo of spines: colour bars, dark lines, a little grain."""
    im = Image.new("RGB", (width, height), (240, 230, 210))
    draw = ImageDraw.Draw(im)
    rng = random.Random(3)
    top, bottom = height // 15, height - height // 15
    x = 0
    while x < width:
        w = rng.randint(width // 65, width // 25)
        draw.rectangle([x, top, x + w, bottom],
                       fill=(rng.randint(0, 255), rng.randint(0, 255), rng.randint(0, 255)))
        for y in range(top + 2 * top, bottom - top, max(4, height // 75)):
            draw.line([(x + 2, y), (x + w - 2, y)], fill=(rng.randint(0, 80),) * 3, width=rng.randint(1, 3))
        x += w + 4
    grain = Image.effect_noise((width, height), 16).convert("RGB")
    return Image.blend(im, grain, 0.12)


def jpeg_bytes(im: Image.Image, *, gps: bool = False, orientation: int | None = None, quality: int = 95) -> bytes:
    """Encode; with `gps` the EXIF carries a GPS block like a phone camera writes."""
    kwargs: dict = {}
    exif = im.getexif()
    if orientation is not None:
        exif[ORIENTATION] = orientation
    if gps:
        block = exif.get_ifd(GPS_IFD)
        block[1] = "N"
        block[2] = (IFDRational(52), IFDRational(31), IFDRational(0))
        block[3] = "E"
        block[4] = (IFDRational(13), IFDRational(24), IFDRational(0))
    if gps or orientation is not None:
        kwargs["exif"] = exif.tobytes()
    buf = io.BytesIO()
    im.save(buf, format="JPEG", quality=quality, **kwargs)
    return buf.getvalue()


def small_jpeg(width: int = 640, height: int = 480) -> bytes:
    return jpeg_bytes(shelf_image(width, height))


def phone_jpeg_with_gps() -> bytes:
    """A 4000x3000 landscape-sensor JPEG, over 1 MB, tagged to display as portrait, with GPS."""
    return jpeg_bytes(shelf_image(), gps=True, orientation=ROTATE_90_CW)
