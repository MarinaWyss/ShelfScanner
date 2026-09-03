"""The Google adapter against a stubbed SDK client: request construction and response mapping."""

from __future__ import annotations

import httpx
import pytest
from google.genai import errors, types

from shelfscanner.adapters import google
from shelfscanner.adapters.google import BOOKS_SCHEMA, GoogleClient
from shelfscanner.config import Model, load_config

GEMINI = Model("gemini-flash", "google/gemini-3.8-flash", "Google", price_input=0.75, price_output=3.75,
               reasoning_effort="low", adapter="google", model_id="gemini-3.8-flash")
NO_EFFORT = Model("g", "google/g", "Google", price_input=1.0, price_output=10.0, adapter="google", model_id="g")


def _response(text: str | None, finish=types.FinishReason.STOP, *, prompt=1000, answer=50, thoughts=20,
              candidates=True, block_reason=None) -> types.GenerateContentResponse:
    parts = [types.Part(text=text)] if text is not None else []
    return types.GenerateContentResponse(
        response_id="resp-123",
        candidates=[types.Candidate(content=types.Content(role="model", parts=parts), finish_reason=finish)]
        if candidates else None,
        prompt_feedback=types.GenerateContentResponsePromptFeedback(block_reason=block_reason)
        if block_reason else None,
        usage_metadata=types.GenerateContentResponseUsageMetadata(
            prompt_token_count=prompt, candidates_token_count=answer, thoughts_token_count=thoughts),
    )


class StubModels:
    def __init__(self, response=None, exc=None):
        self.response, self.exc, self.calls = response, exc, []

    def generate_content(self, *, model, contents, config):
        self.calls.append({"model": model, "contents": contents, "config": config})
        if self.exc is not None:
            raise self.exc
        return self.response


class StubClient:
    def __init__(self, response=None, exc=None):
        self.models = StubModels(response, exc)


def _client(response=None, exc=None, schema=None) -> tuple[GoogleClient, StubModels]:
    stub = StubClient(response, exc)
    return GoogleClient(schema, client=stub), stub.models


def test_vision_request_carries_image_prompt_schema_cap_and_thinking_level():
    client, models = _client(_response('{"books": [{"title": "Dune", "author": "Frank Herbert"}]}'),
                             schema=BOOKS_SCHEMA)
    seen = []
    r = client.vision(GEMINI, "read the shelf", b"\xff\xd8jpeg", max_tokens=1234, on_progress=seen.append)

    call = models.calls[0]
    assert call["model"] == "gemini-3.8-flash"
    image, prompt = call["contents"]
    assert image.inline_data.data == b"\xff\xd8jpeg" and image.inline_data.mime_type == "image/jpeg"
    assert prompt == "read the shelf"
    cfg = call["config"]
    assert cfg.max_output_tokens == 1234
    assert cfg.response_mime_type == "application/json"
    assert cfg.response_json_schema == BOOKS_SCHEMA
    assert cfg.thinking_config.thinking_level == types.ThinkingLevel.LOW
    assert seen == ["google: gemini-3.8-flash"]
    assert r.ok and r.parsed == {"books": [{"title": "Dune", "author": "Frank Herbert"}]}


def test_success_maps_tokens_cost_ids_and_finish_reason():
    client, _ = _client(_response('{"books": []}'))
    r = client.vision(GEMINI, "p", b"jpeg")
    assert r.ok and r.parsed == {"books": []} and r.raw_text == '{"books": []}'
    assert (r.input_tokens, r.output_tokens, r.reasoning_tokens) == (1000, 70, 20)  # thoughts inside output
    assert r.cost_usd == pytest.approx((1000 * 0.75 + 70 * 3.75) / 1_000_000)
    assert r.finish_reason == "stop" and not r.truncated
    assert r.request_id == "resp-123" and r.adapter == "google" and r.provider == "Google"
    assert r.model == "gemini-3.8-flash" and r.latency_ms >= 0


def test_text_joins_prompt_and_input_and_asks_for_json_without_schema_or_thinking():
    client, models = _client(_response('{"recommendations": []}'))
    r = client.text(NO_EFFORT, "choose", "shelf list")
    call = models.calls[0]
    assert call["contents"] == "choose\n\nshelf list"
    assert call["config"].response_mime_type == "application/json"
    assert call["config"].response_json_schema is None
    assert call["config"].thinking_config is None
    assert r.ok and r.parsed == {"recommendations": []}


def test_truncated_reply_is_reported_as_length_not_parse_failure():
    client, _ = _client(_response('{"books": [{"title": "Du', types.FinishReason.MAX_TOKENS, thoughts=3000))
    r = client.vision(GEMINI, "p", b"jpeg", max_tokens=4096)
    assert not r.ok and r.parsed is None and r.truncated
    assert r.error.startswith("truncated: hit max_tokens=4096") and "reasoning_tokens=3000" in r.error
    assert r.raw_text == '{"books": [{"title": "Du'
    assert r.output_tokens == 3050 and r.request_id == "resp-123"


def test_unparseable_reply_is_a_parse_error_with_the_text_kept():
    client, _ = _client(_response("I cannot see any books here."))
    r = client.vision(GEMINI, "p", b"jpeg")
    assert not r.ok and r.parsed is None and r.finish_reason == "stop"
    assert r.error.startswith("json parse:") and r.raw_text == "I cannot see any books here."


def test_transport_error_returns_a_failed_result_without_raising():
    client, _ = _client(exc=httpx.ConnectTimeout("timed out"))
    r = client.vision(GEMINI, "p", b"jpeg")
    assert not r.ok and r.error.startswith("transport:") and "ConnectTimeout" in r.error
    assert r.adapter == "google" and r.model == "gemini-3.8-flash" and r.parsed is None


def test_api_error_returns_code_and_message():
    exc = errors.APIError(429, {"error": {"code": 429, "status": "RESOURCE_EXHAUSTED", "message": "slow down"}})
    client, _ = _client(exc=exc)
    r = client.text(GEMINI, "p", "x")
    assert not r.ok and r.error == "http 429 RESOURCE_EXHAUSTED: slow down"


def test_unexpected_sdk_exception_is_still_a_failed_result():
    client, _ = _client(exc=RuntimeError("boom"))
    r = client.text(GEMINI, "p", "x")
    assert not r.ok and r.error == "sdk: RuntimeError: boom"


def test_blocked_prompt_with_no_candidates_names_the_reason():
    client, _ = _client(_response(None, candidates=False, block_reason=types.BlockedReason.SAFETY))
    r = client.vision(GEMINI, "p", b"jpeg")
    assert not r.ok and "prompt blocked" in r.error and "SAFETY" in r.error
    assert r.input_tokens == 1000 and r.request_id == "resp-123"


def test_other_finish_reasons_are_lower_cased():
    client, _ = _client(_response("", types.FinishReason.SAFETY))
    r = client.vision(GEMINI, "p", b"jpeg")
    assert r.finish_reason == "safety" and not r.truncated and r.error == "stop_reason 'safety'"


@pytest.mark.parametrize("effort,level", [
    ("none", types.ThinkingLevel.MINIMAL), ("minimal", types.ThinkingLevel.MINIMAL),
    ("low", types.ThinkingLevel.LOW), ("Medium", types.ThinkingLevel.MEDIUM), ("high", types.ThinkingLevel.HIGH),
])
def test_reasoning_effort_maps_to_thinking_level(effort, level):
    assert google.thinking_config(effort).thinking_level == level


def test_reasoning_effort_unset_means_no_thinking_config_and_unknown_is_a_config_error():
    assert google.thinking_config(None) is None
    with pytest.raises(ValueError, match="reasoning_effort 'extreme'"):
        google.thinking_config("extreme")
    # Through the client it is a failed result, never a raise (002 D2), and one failover acts on.
    from dataclasses import replace

    from shelfscanner import router
    r = GoogleClient(client=object()).vision(replace(GEMINI, reasoning_effort="extreme"), "p", b"jpeg")
    assert not r.ok and r.error.startswith("config: reasoning_effort 'extreme'") and router.should_fail_over(r)


def test_missing_api_key_is_a_clear_failed_result(monkeypatch):
    monkeypatch.setattr(google, "load_dotenv", lambda *a, **k: None)
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    r = GoogleClient().vision(GEMINI, "p", b"jpeg")
    assert not r.ok and r.error == "config: GEMINI_API_KEY is not set: add it to .env (see .env.example)"
    assert r.adapter == "google"


def test_config_routes_gemini_flash_direct():
    m = load_config().model("gemini-flash")
    assert m.adapter == "google" and m.model_id == "gemini-3.8-flash" and m.id_for_adapter == "gemini-3.8-flash"
    assert m.slug == "google/gemini-3.8-flash"  # what the rows keep logging
