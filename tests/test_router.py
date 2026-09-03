"""The router seam: a fake client reaches the pipeline's call sites without any provider."""

from shelfscanner import router
from shelfscanner.adapters.base import CallResult, cost_from_tokens
from shelfscanner.config import Model, load_config


class FakeClient:
    def __init__(self, parsed):
        self.parsed = parsed
        self.calls = []

    def vision(self, model, prompt, image_jpeg, *, max_tokens=4096, on_progress=None):
        self.calls.append(("vision", model.alias, len(image_jpeg)))
        if on_progress:
            on_progress("reading")
        return CallResult(model.slug, "fake", "{}", self.parsed, 10, 5, 0.0, 1, None, "stop", adapter="fake")

    def text(self, model, prompt, input_text, *, max_tokens=4096, on_progress=None):
        self.calls.append(("text", model.alias, input_text))
        return CallResult(model.slug, "fake", "{}", self.parsed, 10, 5, 0.0, 1, None, "stop", adapter="fake")


def test_vision_and_text_dispatch_to_a_passed_client():
    fake = FakeClient({"books": []})
    m = load_config().model("gemini-flash")
    seen = []
    r = router.vision(m, "p", b"jpeg", client=fake, on_progress=seen.append)
    assert r.ok and r.parsed == {"books": []} and seen == ["reading"]
    r = router.text(m, "p", "shelf", client=fake)
    assert r.ok and fake.calls[-1] == ("text", "gemini-flash", "shelf")


def test_stage_primary_resolves_to_a_model():
    assert router.primary("reading").alias == load_config().stage("reading").primary
    assert router.primary("choosing").alias == load_config().stage("choosing").primary


def test_unknown_adapter_is_a_clear_error():
    import pytest
    with pytest.raises(SystemExit, match="Unknown adapter"):
        router.client_for("nope")


def test_cost_from_tokens_uses_config_prices():
    m = Model("x", "x/y", "X", price_input=1.0, price_output=10.0)
    assert cost_from_tokens(m, 1_000_000, 100_000) == 2.0
    assert cost_from_tokens(m, None, 5) is None
