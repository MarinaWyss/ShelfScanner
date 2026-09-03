"""The OpenAI adapter against a stubbed SDK client: request shape and response mapping, no network.

Replies are real `openai.types.responses.Response` objects so the test breaks if the SDK renames
a field the adapter reads (002's "provider SDK churn" risk).
"""

from __future__ import annotations

import base64
from dataclasses import dataclass, field
from typing import Any

import httpx2
import openai
import pytest
from openai.types.responses import Response

from shelfscanner.adapters import openai as adapter
from shelfscanner.adapters.openai import OpenAIClient
from shelfscanner.config import Model, load_config

MODEL = Model("gpt-mini", "openai/gpt-5.4-mini", "OpenAI", price_input=0.75, price_output=4.50,
              reasoning_effort="low", adapter="openai", model_id="gpt-5.4-mini")
NO_EFFORT = Model("gpt-mini", "openai/gpt-5.4-mini", "OpenAI", 0.75, 4.50, adapter="openai", model_id="gpt-5.4-mini")


def response(text: str | None = "{\"books\": []}", *, status: str = "completed", incomplete: str | None = None,
             input_tokens: int = 1000, output_tokens: int = 200, reasoning_tokens: int = 50,
             error: dict | None = None, refusal: str | None = None, request_id: str | None = "req_abc") -> Response:
    content: list[dict[str, Any]] = []
    if text is not None:
        content.append({"type": "output_text", "text": text, "annotations": []})
    if refusal is not None:
        content.append({"type": "refusal", "refusal": refusal})
    body: dict[str, Any] = {
        "id": "resp_1", "created_at": 1.0, "model": "gpt-5.4-mini-2026-03-17", "object": "response",
        "output": [{"id": "msg_1", "type": "message", "role": "assistant", "status": "completed",
                    "content": content}],
        "parallel_tool_calls": False, "tool_choice": "auto", "tools": [], "status": status,
        "usage": {"input_tokens": input_tokens,
                  "input_tokens_details": {"cached_tokens": 0, "cache_write_tokens": 0},
                  "output_tokens": output_tokens,
                  "output_tokens_details": {"reasoning_tokens": reasoning_tokens},
                  "total_tokens": input_tokens + output_tokens},
    }
    if incomplete:
        body["incomplete_details"] = {"reason": incomplete}
    if error:
        body["error"] = error
    r = Response.model_validate(body)
    r._request_id = request_id
    return r


@dataclass
class StubResponses:
    reply: Any = None  # a Response, or an exception instance to raise
    calls: list[dict] = field(default_factory=list)

    def create(self, **kwargs):
        self.calls.append(kwargs)
        if isinstance(self.reply, BaseException):
            raise self.reply
        return self.reply


@dataclass
class StubSDK:
    responses: StubResponses


def client_with(reply, **kwargs) -> tuple[OpenAIClient, StubResponses]:
    stub = StubResponses(reply)
    return OpenAIClient(client=StubSDK(stub), **kwargs), stub


# -- request construction --------------------------------------------------------------------


def test_vision_request_sends_data_url_image_then_prompt_in_json_mode():
    c, stub = client_with(response())
    c.vision(MODEL, "Read the shelf.", b"\xff\xd8jpeg", max_tokens=1234)
    req = stub.calls[0]
    assert req["model"] == "gpt-5.4-mini"
    assert req["max_output_tokens"] == 1234
    assert req["store"] is False
    assert req["text"] == {"format": {"type": "json_object"}}
    assert req["reasoning"] == {"effort": "low"}
    (msg,) = req["input"]
    assert msg["role"] == "user"
    image, text = msg["content"]
    assert image["type"] == "input_image" and image["detail"] == "auto"
    assert image["image_url"] == "data:image/jpeg;base64," + base64.b64encode(b"\xff\xd8jpeg").decode()
    assert text == {"type": "input_text", "text": "Read the shelf."}


def test_text_request_joins_prompt_and_input_with_a_blank_line():
    c, stub = client_with(response())
    c.text(MODEL, "Pick five.", "- A\n- B")
    (msg,) = stub.calls[0]["input"]
    assert msg["content"] == [{"type": "input_text", "text": "Pick five.\n\n- A\n- B"}]


def test_no_reasoning_effort_in_config_omits_the_parameter():
    c, stub = client_with(response())
    c.text(NO_EFFORT, "p", "x")
    assert "reasoning" not in stub.calls[0]


def test_schema_switches_to_strict_json_schema():
    schema = {"type": "object", "properties": {"books": {"type": "array"}}, "required": ["books"],
              "additionalProperties": False}
    c, stub = client_with(response(), schema=schema, schema_name="shelf")
    c.text(MODEL, "p", "x")
    assert stub.calls[0]["text"] == {"format": {"type": "json_schema", "name": "shelf", "schema": schema,
                                                "strict": True}}


def test_progress_callback_fires_before_the_call():
    c, _ = client_with(response())
    seen: list[str] = []
    c.text(MODEL, "p", "x", on_progress=seen.append)
    assert seen == ["openai: calling gpt-5.4-mini"]


# -- response mapping ------------------------------------------------------------------------


def test_success_maps_tokens_cost_reasoning_and_request_id():
    c, _ = client_with(response('{"books": [{"title": "Dune"}]}', input_tokens=1_000_000, output_tokens=100_000,
                                reasoning_tokens=40_000))
    r = c.text(MODEL, "p", "x")
    assert r.ok and r.parsed == {"books": [{"title": "Dune"}]}
    assert r.finish_reason == "stop" and not r.truncated
    assert (r.input_tokens, r.output_tokens, r.reasoning_tokens) == (1_000_000, 100_000, 40_000)
    assert r.cost_usd == pytest.approx(0.75 + 0.45)  # reasoning already inside output_tokens, priced as output
    assert r.request_id == "req_abc"
    assert r.adapter == "openai" and r.provider == "OpenAI" and r.model == "gpt-5.4-mini"
    assert r.latency_ms >= 0


def test_truncation_is_reported_as_length_not_a_parse_failure():
    c, _ = client_with(response('{"books": [{"title": "Du', status="incomplete", incomplete="max_output_tokens",
                                reasoning_tokens=3900))
    r = c.text(MODEL, "p", "x", max_tokens=4096)
    assert r.finish_reason == "length" and r.truncated
    assert r.parsed is None
    assert r.error == "truncated: hit max_tokens=4096 (reasoning_tokens=3900)"
    assert r.raw_text == '{"books": [{"title": "Du'
    assert r.cost_usd is not None


def test_other_incomplete_reasons_pass_through():
    c, _ = client_with(response("", status="incomplete", incomplete="content_filter"))
    r = c.text(MODEL, "p", "x")
    assert r.finish_reason == "content_filter" and not r.ok


def test_unparseable_reply_is_a_json_error_with_the_text_kept():
    c, _ = client_with(response("Sorry, I can't see any books."))
    r = c.text(MODEL, "p", "x")
    assert not r.ok and r.error.startswith("json parse:")
    assert r.raw_text == "Sorry, I can't see any books." and r.parsed is None
    assert r.finish_reason == "stop" and r.input_tokens == 1000


def test_refusal_without_text_is_named():
    c, _ = client_with(response(None, refusal="I can't help with that."))
    r = c.text(MODEL, "p", "x")
    assert r.error == "refusal: I can't help with that." and r.raw_text is None


def test_model_side_error_object_is_returned_not_raised():
    c, _ = client_with(response(None, status="failed", error={"code": "server_error", "message": "boom"}))
    r = c.text(MODEL, "p", "x")
    assert r.error == "model: server_error: boom" and r.request_id == "req_abc" and r.parsed is None


# -- transport and configuration failures ----------------------------------------------------


def _http_error(status: int, message: str) -> openai.APIStatusError:
    req = httpx2.Request("POST", "https://api.openai.com/v1/responses")
    resp = httpx2.Response(status, request=req, headers={"x-request-id": "req_err"},
                           json={"error": {"message": message}})
    return openai.APIStatusError(message, response=resp, body=None)


def test_http_status_error_becomes_a_failed_result_with_request_id():
    c, _ = client_with(_http_error(429, "Rate limit reached"))
    r = c.vision(MODEL, "p", b"jpeg")
    assert not r.ok and r.error == "http 429: Rate limit reached"
    assert r.request_id == "req_err" and r.adapter == "openai" and r.model == "gpt-5.4-mini"
    assert r.parsed is None and r.cost_usd is None


def test_timeout_and_connection_errors_become_transport_failures():
    req = httpx2.Request("POST", "https://api.openai.com/v1/responses")
    for exc in (openai.APITimeoutError(request=req), openai.APIConnectionError(request=req)):
        c, _ = client_with(exc)
        r = c.text(MODEL, "p", "x")
        assert not r.ok and r.error.startswith("transport:")


def test_missing_key_is_a_clear_error_and_no_call(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.setattr(adapter, "load_dotenv", lambda *a, **k: None)
    r = OpenAIClient().text(MODEL, "p", "x")
    assert not r.ok and "OPENAI_API_KEY is not set" in r.error and r.adapter == "openai"


def test_key_from_env_builds_a_real_sdk_client(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    monkeypatch.setattr(adapter, "load_dotenv", lambda *a, **k: None)
    c = OpenAIClient()
    assert isinstance(c._sdk_client(), openai.OpenAI)


# -- wiring ----------------------------------------------------------------------------------


def test_gpt_mini_is_configured_for_this_adapter():
    m = load_config().model("gpt-mini")
    assert m.adapter == "openai" and m.id_for_adapter == "gpt-5.4-mini"
    assert m.slug == "openai/gpt-5.4-mini"  # the logged name is unchanged, rows stay comparable with 001


def test_router_resolves_the_adapter_by_name():
    from shelfscanner import router
    router.client_for.cache_clear()
    assert isinstance(router.client_for("openai"), OpenAIClient)
