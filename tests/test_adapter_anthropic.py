"""The Anthropic adapter against a stubbed SDK client: request construction and response mapping, no network."""

from __future__ import annotations

import base64
from types import SimpleNamespace

import anthropic
import httpx2
import pytest

from shelfscanner.adapters import anthropic as adapter
from shelfscanner.adapters.anthropic import AnthropicClient, reasoning_params
from shelfscanner.config import Model, load_config

SONNET = Model("sonnet", "anthropic/claude-sonnet-5", "Anthropic", 2.0, 10.0,
               reasoning_effort="low", adapter="anthropic", model_id="claude-sonnet-5")
HAIKU = Model("haiku", "anthropic/claude-haiku-4.5", "Anthropic", 1.0, 5.0,
              reasoning_effort="medium", adapter="anthropic", model_id="claude-haiku-4-5")


def _response(text: str | None, stop_reason: str = "end_turn", *, thinking_tokens: int | None = 7,
              input_tokens: int = 1000, output_tokens: int = 200, blocks: list | None = None):
    content = blocks if blocks is not None else []
    if text is not None:
        content = content + [SimpleNamespace(type="text", text=text)]
    details = SimpleNamespace(thinking_tokens=thinking_tokens) if thinking_tokens is not None else None
    usage = SimpleNamespace(input_tokens=input_tokens, output_tokens=output_tokens,
                            cache_creation_input_tokens=0, cache_read_input_tokens=0, output_tokens_details=details)
    return SimpleNamespace(content=content, stop_reason=stop_reason, stop_details=None, usage=usage,
                           _request_id="req_123")


class StubSDK:
    """Looks like `anthropic.Anthropic()` as far as the adapter is concerned: `.messages.create(**kw)`."""

    def __init__(self, outcome):
        self.outcome = outcome
        self.requests = []
        self.messages = SimpleNamespace(create=self._create)

    def _create(self, **kwargs):
        self.requests.append(kwargs)
        if isinstance(self.outcome, Exception):
            raise self.outcome
        return self.outcome


def _connection_error():
    return anthropic.APIConnectionError(message="boom", request=httpx2.Request("POST", "https://api.anthropic.com/v1/messages"))


def _status_error(status: int, message: str):
    resp = httpx2.Response(status, request=httpx2.Request("POST", "https://api.anthropic.com/v1/messages"))
    return anthropic.APIStatusError(message, response=resp, body={"error": {"message": message}})


# --- request construction -------------------------------------------------------------------


def test_vision_request_has_image_then_prompt_adaptive_thinking_and_schema():
    sdk = StubSDK(_response('{"books": []}'))
    AnthropicClient(client=sdk).vision(SONNET, "read the shelf", b"\xff\xd8jpeg", max_tokens=2048)
    (req,) = sdk.requests
    assert req["model"] == "claude-sonnet-5"
    assert req["max_tokens"] == 2048
    image, text = req["messages"][0]["content"]
    assert image["type"] == "image" and image["source"]["media_type"] == "image/jpeg"
    assert base64.b64decode(image["source"]["data"]) == b"\xff\xd8jpeg"
    assert text == {"type": "text", "text": "read the shelf"}
    assert req["thinking"] == {"type": "adaptive"}
    assert req["output_config"]["effort"] == "low"
    assert req["output_config"]["format"] == {"type": "json_schema", "schema": adapter.EXTRACTION_SCHEMA}


def test_text_request_appends_input_and_uses_recommendation_schema():
    sdk = StubSDK(_response('{"recommendations": []}'))
    AnthropicClient(client=sdk).text(SONNET, "pick five", "Books on the shelf:\n- A")
    (req,) = sdk.requests
    assert req["messages"][0]["content"] == [{"type": "text", "text": "pick five\n\nBooks on the shelf:\n- A"}]
    assert req["output_config"]["format"]["schema"] is adapter.RECOMMENDATION_SCHEMA


def test_schemas_can_be_switched_off():
    sdk = StubSDK(_response('{"books": []}'))
    AnthropicClient(client=sdk, schemas=None).vision(SONNET, "p", b"jpeg")
    assert "format" not in sdk.requests[0].get("output_config", {})


@pytest.mark.parametrize("effort, expected", [
    (None, {}),
    ("none", {"thinking": {"type": "disabled"}}),
    ("minimal", {"thinking": {"type": "adaptive"}, "output_config": {"effort": "low"}}),
    ("medium", {"thinking": {"type": "adaptive"}, "output_config": {"effort": "medium"}}),
    ("max", {"thinking": {"type": "adaptive"}, "output_config": {"effort": "max"}}),
])
def test_effort_mapping_for_adaptive_models(effort, expected):
    m = Model("s", "x/y", "Anthropic", 1, 1, reasoning_effort=effort, model_id="claude-sonnet-5")
    assert reasoning_params(m, 4096) == expected


@pytest.mark.parametrize("effort, max_tokens, expected", [
    (None, 4096, {}),
    ("none", 4096, {}),
    ("low", 4096, {"thinking": {"type": "enabled", "budget_tokens": 1024}}),
    ("medium", 4096, {"thinking": {"type": "enabled", "budget_tokens": 3072}}),  # capped to leave reply room
    ("high", 32000, {"thinking": {"type": "enabled", "budget_tokens": 16384}}),
    ("high", 1500, {}),  # no room for the minimum budget: thinking off rather than a 400
])
def test_effort_mapping_for_budget_models(effort, max_tokens, expected):
    m = Model("h", "x/y", "Anthropic", 1, 1, reasoning_effort=effort, model_id="claude-haiku-4-5")
    assert reasoning_params(m, max_tokens) == expected
    assert "output_config" not in expected  # effort is rejected on Haiku 4.5


def test_unknown_effort_is_a_failed_result_not_an_exception():
    sdk = StubSDK(_response("{}"))
    m = Model("s", "x/y", "Anthropic", 1, 1, reasoning_effort="turbo", model_id="claude-sonnet-5")
    r = AnthropicClient(client=sdk).text(m, "p", "t")
    assert not r.ok and "turbo" in r.error and sdk.requests == []


# --- response mapping -----------------------------------------------------------------------


def test_success_maps_tokens_cost_request_id_and_finish_reason():
    sdk = StubSDK(_response('{"books": [{"title": "Dune", "author": null}]}'))
    seen = []
    r = AnthropicClient(client=sdk).vision(SONNET, "p", b"jpeg", on_progress=seen.append)
    assert r.ok
    assert r.parsed == {"books": [{"title": "Dune", "author": None}]}
    assert r.model == "claude-sonnet-5" and r.provider == "Anthropic" and r.adapter == "anthropic"
    assert r.request_id == "req_123"
    assert r.finish_reason == "stop" and not r.truncated
    assert (r.input_tokens, r.output_tokens, r.reasoning_tokens) == (1000, 200, 7)
    assert r.cost_usd == pytest.approx((1000 * 2.0 + 200 * 10.0) / 1_000_000)
    assert seen == ["anthropic claude-sonnet-5"]


def test_reasoning_tokens_absent_when_api_does_not_report_them():
    sdk = StubSDK(_response("{}", thinking_tokens=None))
    r = AnthropicClient(client=sdk).text(HAIKU, "p", "t")
    assert r.ok and r.reasoning_tokens is None and r.cost_usd == pytest.approx((1000 * 1.0 + 200 * 5.0) / 1_000_000)


def test_truncation_is_reported_as_length_not_parse_failure():
    sdk = StubSDK(_response('{"books": [{"title": "Du', stop_reason="max_tokens"))
    r = AnthropicClient(client=sdk).vision(SONNET, "p", b"jpeg", max_tokens=300)
    assert not r.ok and r.truncated and r.finish_reason == "length"
    assert r.error.startswith("truncated: hit max_tokens=300")
    assert r.raw_text == '{"books": [{"title": "Du'


def test_refusal_is_an_error_with_the_raw_stop_reason():
    sdk = StubSDK(_response(None, stop_reason="refusal"))
    r = AnthropicClient(client=sdk).vision(SONNET, "p", b"jpeg")
    assert not r.ok and r.finish_reason == "refusal" and "refusal" in r.error


def test_unparseable_reply_is_a_parse_error():
    sdk = StubSDK(_response("Sorry, I could not read any titles."))
    r = AnthropicClient(client=sdk).vision(SONNET, "p", b"jpeg")
    assert not r.ok and r.error.startswith("json parse:") and r.finish_reason == "stop"
    assert r.parsed is None and r.raw_text.startswith("Sorry")


def test_reply_with_no_text_block_is_an_error():
    sdk = StubSDK(_response(None, blocks=[SimpleNamespace(type="thinking", thinking="")]))
    r = AnthropicClient(client=sdk).text(SONNET, "p", "t")
    assert not r.ok and "no text block" in r.error and r.request_id == "req_123"


def test_transport_error_never_raises():
    sdk = StubSDK(_connection_error())
    r = AnthropicClient(client=sdk).vision(SONNET, "p", b"jpeg")
    assert not r.ok and r.error.startswith("transport:") and r.adapter == "anthropic" and r.model == "claude-sonnet-5"
    assert r.cost_usd is None and r.parsed is None


def test_api_status_error_is_reported_with_the_status():
    sdk = StubSDK(_status_error(529, "Overloaded"))
    r = AnthropicClient(client=sdk).text(SONNET, "p", "t")
    assert not r.ok and r.error == "http 529: Overloaded"


def test_missing_api_key_is_a_clear_error_not_an_exception(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.setattr(adapter, "load_dotenv", lambda *a, **k: None)
    r = AnthropicClient().vision(SONNET, "p", b"jpeg")
    assert not r.ok and "ANTHROPIC_API_KEY" in r.error and ".env" in r.error


# --- config ---------------------------------------------------------------------------------


def test_config_points_the_claude_models_at_this_adapter():
    cfg = load_config()
    assert (cfg.model("sonnet").adapter, cfg.model("sonnet").id_for_adapter) == ("anthropic", "claude-sonnet-5")
    assert (cfg.model("haiku").adapter, cfg.model("haiku").id_for_adapter) == ("anthropic", "claude-haiku-4-5")
    assert cfg.model("claude-sonnet-5").alias == "sonnet"
