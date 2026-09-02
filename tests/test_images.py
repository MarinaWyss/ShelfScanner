"""strip_metadata guards a privacy promise: no EXIF (GPS) or XMP leaves the machine.

The fixture is built in memory so the test does not depend on the gitignored
photos in data/photos.
"""

import io

import pytest
from PIL import Image
from PIL.TiffImagePlugin import IFDRational

from shelfscanner.images import has_metadata, strip_metadata

ORIENTATION = 0x0112
GPS_IFD = 0x8825
ROTATE_90_CW = 6  # EXIF orientation: pixels need a 90° clockwise turn to display upright

XMP = (
    b'<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>'
    b'<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">'
    b'<rdf:Description xmlns:xmp="http://ns.adobe.com/xap/1.0/" xmp:CreatorTool="phone"/>'
    b"</rdf:RDF></x:xmpmeta><?xpacket end=\"w\"?>"
)
FAKE_ICC = b"ICC_PROFILE_TEST_" + b"\x00" * 64


@pytest.fixture
def tagged_jpeg(tmp_path):
    """A 40x20 JPEG carrying GPS EXIF, an orientation tag, XMP, and an ICC profile."""
    im = Image.new("RGB", (40, 20), "white")
    exif = im.getexif()
    exif[ORIENTATION] = ROTATE_90_CW
    gps = exif.get_ifd(GPS_IFD)
    gps[1] = "N"  # GPSLatitudeRef
    gps[2] = (IFDRational(52), IFDRational(31), IFDRational(0))  # GPSLatitude
    gps[3] = "E"
    gps[4] = (IFDRational(13), IFDRational(24), IFDRational(0))
    path = tmp_path / "shelf.jpg"
    im.save(path, format="JPEG", exif=exif.tobytes(), xmp=XMP, icc_profile=FAKE_ICC)

    with Image.open(path) as check:
        assert check.getexif().get_ifd(GPS_IFD), "fixture must carry GPS"
        assert "xmp" in check.info, "fixture must carry XMP"
    return path


def test_fixture_is_detected_as_carrying_metadata(tagged_jpeg):
    assert has_metadata(tagged_jpeg.read_bytes())


def test_strip_removes_exif_and_xmp(tagged_jpeg):
    data = strip_metadata(tagged_jpeg)
    assert not has_metadata(data)
    with Image.open(io.BytesIO(data)) as im:
        assert not im.getexif()
        assert not im.getexif().get_ifd(GPS_IFD)
        assert "xmp" not in im.info


def test_strip_leaves_no_marker_bytes(tagged_jpeg):
    data = strip_metadata(tagged_jpeg)
    assert b"GPS" not in data
    assert b"Exif" not in data
    assert b"http://ns.adobe.com/xap" not in data


def test_strip_applies_orientation_to_pixels(tagged_jpeg):
    # Dropping the tag without rotating would leave a 40x20 image that phones showed as 20x40.
    with Image.open(io.BytesIO(strip_metadata(tagged_jpeg))) as im:
        assert im.size == (20, 40)


def test_strip_keeps_icc_profile(tagged_jpeg):
    with Image.open(io.BytesIO(strip_metadata(tagged_jpeg))) as im:
        assert im.info.get("icc_profile") == FAKE_ICC
