"""Failover (002 D8): once, onto the stage's fallback, only from the primary, only for provider errors."""

from shelfscanner import router
from shelfscanner.adapters.base import CallResult
from shelfscanner.config import load_config


def _ok(model):
    return CallResult(model.slug, "fake", "{}", {"books": []}, 1, 1, 0.0, 1, None, "stop", adapter="fake")


def _err(model, error, finish="stop"):
    return CallResult(model.slug, "fake", None, None, None, None, None, 1, error, finish, adapter="fake")


def _script(*outcomes):
    """A call function that replays outcomes in order and records which model it was given."""
    seen = []
    queue = list(outcomes)

    def call(model):
        seen.append(model.alias)
        kind, *arg = queue.pop(0)
        return _ok(model) if kind == "ok" else _err(model, *arg)

    return call, seen


def test_primary_success_does_not_fail_over():
    call, seen = _script(("ok",))
    sr = router.with_failover("reading", None, call)
    assert sr.result.ok and sr.failover_from is None
    assert seen == [load_config().stage("reading").primary]


def test_provider_error_on_primary_falls_over_once_and_records_both():
    st = load_config().stage("reading")
    call, seen = _script(("err", "http 429: rate limited"), ("ok",))
    progress = []
    sr = router.with_failover("reading", None, call, on_progress=progress.append)
    assert sr.result.ok
    assert sr.model.alias == st.fallback
    assert sr.failover_from == load_config().model(st.primary).slug
    assert sr.failover_error.startswith("http 429")
    assert seen == [st.primary, st.fallback]
    assert progress and "trying" in progress[0]


def test_truncation_counts_as_a_provider_failure():
    call, seen = _script(("err", "truncated: hit max_tokens=4096", "length"), ("ok",))
    sr = router.with_failover("choosing", None, call)
    assert sr.result.ok and sr.failover_from is not None and len(seen) == 2


def test_parse_failure_is_a_finding_not_a_failover():
    call, seen = _script(("err", "json parse: Expecting value"))
    sr = router.with_failover("reading", None, call)
    assert not sr.result.ok and sr.failover_from is None and len(seen) == 1


def test_fallback_failing_too_returns_its_error_with_the_first_recorded():
    call, seen = _script(("err", "transport: boom"), ("err", "http 500: down"))
    sr = router.with_failover("reading", None, call)
    assert not sr.result.ok and sr.result.error.startswith("http 500")
    assert sr.failover_error.startswith("transport") and len(seen) == 2


def test_explicit_non_primary_model_never_fails_over():
    cfg = load_config()
    other = cfg.model("haiku")
    assert other.alias not in (cfg.stage("reading").primary, cfg.stage("reading").fallback)
    call, seen = _script(("err", "http 503: nope"))
    sr = router.with_failover("reading", other, call)
    assert not sr.result.ok and sr.failover_from is None and seen == ["haiku"]


def test_explicit_primary_model_still_fails_over():
    cfg = load_config()
    primary = cfg.model(cfg.stage("choosing").primary)
    call, seen = _script(("err", "config: OPENAI_API_KEY is not set"), ("ok",))
    sr = router.with_failover("choosing", primary, call)
    assert sr.result.ok and sr.failover_from == primary.slug and len(seen) == 2
