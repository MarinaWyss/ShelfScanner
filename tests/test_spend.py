"""The spend guard refuses model calls past the cap, so it is tested against a fake client and a temp config."""

from datetime import UTC, datetime
from types import SimpleNamespace

import pytest

from shelfscanner import spend


class _Query:
    def __init__(self, rows):
        self.rows = rows
        self.filters = []

    def select(self, columns):
        self.columns = columns
        return self

    def gte(self, column, value):
        self.filters.append((column, value))
        return self

    def execute(self):
        return SimpleNamespace(data=self.rows)


class FakeClient:
    """Enough of the Supabase client for `table(...).select(...).gte(...).execute().data`."""

    def __init__(self, extractions=(), recommendations=()):
        self.rows = {"extractions": list(extractions), "recommendations": list(recommendations)}
        self.calls = []

    def table(self, name):
        q = _Query(self.rows[name])
        self.calls.append((name, q))
        return q


SINCE = datetime(2026, 9, 2, tzinfo=UTC)


def _no_dotenv(monkeypatch):
    monkeypatch.setattr(spend, "load_dotenv", lambda *a, **k: None)


def test_no_cap_means_no_check(monkeypatch):
    _no_dotenv(monkeypatch)
    monkeypatch.delenv(spend.ENV_VAR, raising=False)
    client = FakeClient(extractions=[{"cost_usd": 99.0}])
    assert spend.check_spend(client) is None
    assert client.calls == []


def test_under_cap_returns_spend_so_far():
    client = FakeClient(extractions=[{"cost_usd": 0.0076}, {"cost_usd": None}], recommendations=[{"cost_usd": "0.002"}])
    assert spend.check_spend(client, cap=5.0, since=SINCE) == pytest.approx(0.0096)


def test_sums_both_tables_since_the_date():
    client = FakeClient(extractions=[{"cost_usd": 1.0}], recommendations=[{"cost_usd": 2.0}])
    assert spend.spent_since(client, SINCE) == 3.0
    assert [name for name, _ in client.calls] == ["extractions", "recommendations"]
    for _, q in client.calls:
        assert q.columns == "cost_usd"
        assert q.filters == [("created_at", "2026-09-02T00:00:00+00:00")]


@pytest.mark.parametrize("spent", [5.01, 5.0])
def test_at_or_over_cap_refuses(spent):
    client = FakeClient(extractions=[{"cost_usd": spent}])
    with pytest.raises(SystemExit) as e:
        spend.check_spend(client, cap=5.0, since=SINCE)
    msg = str(e.value)
    assert "Spend cap reached" in msg and f"${spent:.4f}" in msg and "2026-09-02" in msg and spend.ENV_VAR in msg


def test_cap_from_environment(monkeypatch):
    _no_dotenv(monkeypatch)
    monkeypatch.setenv(spend.ENV_VAR, "2.5")
    assert spend.spend_cap() == 2.5
    monkeypatch.setenv(spend.ENV_VAR, "")
    assert spend.spend_cap() is None
    for bad in ("five", "-1"):
        monkeypatch.setenv(spend.ENV_VAR, bad)
        with pytest.raises(SystemExit):
            spend.spend_cap()


@pytest.mark.parametrize("line, expected", [
    ("", spend.EPOCH),
    ("spend_since = 2026-09-02", SINCE),
    ('spend_since = "2026-09-02"', SINCE),
    ("spend_since = 2026-09-02T10:00:00Z", datetime(2026, 9, 2, 10, tzinfo=UTC)),
    ("spend_since = 2026-09-02T10:00:00", datetime(2026, 9, 2, 10, tzinfo=UTC)),
])
def test_since_from_config(tmp_path, line, expected):
    path = tmp_path / "models.toml"
    path.write_text(f"[settings]\nmatch_threshold = 0.85\n{line}\n")
    assert spend.spend_since(path) == expected


def test_bad_since_is_refused(tmp_path):
    path = tmp_path / "models.toml"
    path.write_text('[settings]\nspend_since = "last tuesday"\n')
    with pytest.raises(SystemExit):
        spend.spend_since(path)


def test_check_spend_reads_env_and_config_by_default(monkeypatch, tmp_path):
    _no_dotenv(monkeypatch)
    monkeypatch.setenv(spend.ENV_VAR, "1")
    path = tmp_path / "models.toml"
    path.write_text("[settings]\nspend_since = 2026-09-02\n")
    monkeypatch.setattr(spend, "CONFIG_PATH", path)
    client = FakeClient(extractions=[{"cost_usd": 0.5}])
    assert spend.check_spend(client) == 0.5
    assert client.calls[0][1].filters == [("created_at", "2026-09-02T00:00:00+00:00")]
    client = FakeClient(extractions=[{"cost_usd": 0.5}], recommendations=[{"cost_usd": 0.5}])
    with pytest.raises(SystemExit):
        spend.check_spend(client)
