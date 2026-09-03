"""Pure pieces of task 4: config loading, JSON reply parsing, image resizing."""

import io
import json

import pytest
from PIL import Image

from shelfscanner import router
from shelfscanner.config import load_config
from shelfscanner.images import resize
from shelfscanner.adapters.base import parse_json


def test_config_has_four_candidates_with_slugs_and_settings():
    cfg = load_config()
    assert len(cfg.models) == 5
    assert {m.provider for m in cfg.models.values()} == {"Anthropic", "OpenAI", "Google", "Alibaba"}
    assert all("/" in m.slug for m in cfg.models.values())
    assert 0 < cfg.match_threshold < 1
    assert cfg.default_max_edge == 1568


def test_stages_name_known_models_with_fallbacks():
    cfg = load_config()
    assert set(cfg.stages) == {"reading", "choosing"}
    for st in cfg.stages.values():
        assert cfg.model(st.primary).alias == st.primary
        assert st.fallback is not None and cfg.model(st.fallback).alias == st.fallback
    assert all(m.adapter in router.ADAPTERS for m in cfg.models.values())
    assert cfg.prices_checked is not None


def test_model_lookup_by_alias_and_slug():
    cfg = load_config()
    by_alias = cfg.model("haiku")
    assert cfg.model(by_alias.slug) is by_alias
    with pytest.raises(SystemExit):
        cfg.model("nope")


@pytest.mark.parametrize(
    "reply",
    [
        '{"titles": ["A"]}',
        '```json\n{"titles": ["A"]}\n```',
        '```\n{"titles": ["A"]}\n```',
        'Here you go:\n{"titles": ["A"]}\nHope that helps.',
    ],
)
def test_parse_json_tolerates_fences_and_chatter(reply):
    assert parse_json(reply) == {"titles": ["A"]}


def test_parse_json_raises_on_garbage():
    with pytest.raises(json.JSONDecodeError):
        parse_json("no json here")


def _jpeg(w, h):
    buf = io.BytesIO()
    Image.new("RGB", (w, h), "gray").save(buf, format="JPEG")
    return buf.getvalue()


def test_resize_shrinks_long_edge_and_keeps_aspect():
    r = resize(_jpeg(4032, 2268), 1568)
    assert (r.width, r.height) == (1568, 882)
    with Image.open(io.BytesIO(r.jpeg)) as im:
        assert im.size == (1568, 882)


def test_resize_handles_portrait():
    r = resize(_jpeg(2268, 4032), 1568)
    assert (r.width, r.height) == (882, 1568)


def test_resize_never_upscales():
    r = resize(_jpeg(800, 600), 1568)
    assert (r.width, r.height) == (800, 600)
