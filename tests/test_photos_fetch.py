"""`photos fetch` rebuilds data/photos from label files without the network: sourced photos through an
injected getter, derived photos through images.degrade."""

import io
import json

import pytest
from PIL import Image
from shelfscanner.photos_fetch import fetch_photos, to_jpeg


def png_bytes(size=(60, 40)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", size, (200, 30, 30)).save(buf, format="PNG")
    return buf.getvalue()


@pytest.fixture
def dirs(tmp_path):
    labels, photos = tmp_path / "labels", tmp_path / "photos"
    labels.mkdir()
    (labels / "wm_shop.json").write_text(json.dumps({
        "titles": [], "partial": [], "notes": "", "set": "sourced", "provisional": True,
        "source": {"url": "https://example.org/shop.png", "author": "a", "license": "CC0", "license_url": "u", "query": "q"},
    }))
    (labels / "PXL_1.json").write_text(json.dumps({"titles": ["A"], "partial": [], "notes": None}))
    (labels / "PXL_1__small.json").write_text(json.dumps({
        "titles": ["A"], "partial": [], "notes": "", "set": "derived", "derived_from": "PXL_1",
        "degradation": {"kind": "small", "params": {"max_edge": 30}},
    }))
    return labels, photos


def test_to_jpeg_converts_png():
    out = to_jpeg(png_bytes())
    with Image.open(io.BytesIO(out)) as im:
        assert im.format == "JPEG" and im.size == (60, 40)


def test_fetch_downloads_sourced_and_derives_from_local_original(dirs):
    labels, photos = dirs
    calls: list[str] = []

    def get(url: str) -> bytes:
        calls.append(url)
        return png_bytes()

    # The core original exists locally (it can never be fetched); the derived copy is built from it.
    photos.mkdir()
    (photos / "PXL_1.jpg").write_bytes(to_jpeg(png_bytes((80, 40))))

    lines = fetch_photos(labels_dir=labels, photos_dir=photos, get=get)

    assert calls == ["https://example.org/shop.png"]
    assert (photos / "wm_shop.jpg").exists()
    with Image.open(photos / "PXL_1__small.jpg") as im:
        assert im.size == (30, 15)
    assert any(line.startswith("got   wm_shop") for line in lines)
    assert any(line.startswith("made  PXL_1__small") for line in lines)
    assert any(line.startswith("have  PXL_1") for line in lines)


def test_fetch_skips_existing_and_reports_missing_original(dirs):
    labels, photos = dirs
    photos.mkdir()
    (photos / "wm_shop.jpg").write_bytes(b"already here")

    def get(url: str) -> bytes:
        raise AssertionError("must not download a photo that exists")

    lines = fetch_photos(labels_dir=labels, photos_dir=photos, get=get)
    assert (photos / "wm_shop.jpg").read_bytes() == b"already here"
    assert any(line.startswith("skip  PXL_1:") for line in lines)  # core, cannot be fetched
    assert any(line.startswith("skip  PXL_1__small:") for line in lines)  # original missing


def test_fetch_reports_a_failed_download_and_continues(dirs):
    labels, photos = dirs

    def get(url: str) -> bytes:
        raise OSError("boom")

    lines = fetch_photos(labels_dir=labels, photos_dir=photos, get=get)
    assert any(line.startswith("fail  wm_shop: boom") for line in lines)
    assert not (photos / "wm_shop.jpg").exists()
