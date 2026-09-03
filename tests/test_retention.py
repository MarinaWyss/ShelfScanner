"""Retention (008 task 3) against a fake Supabase client: selection, exemptions, deletion.

The fake returns every row it is given regardless of the filters the code
asks for, so these tests exercise the client-side guard that keeps labelled
(test-set) photos safe even if the server-side query were wrong. The filters
the code sent are recorded and asserted separately.
"""

from __future__ import annotations

import argparse
from datetime import UTC, datetime, timedelta

import pytest
from postgrest.exceptions import APIError

from shelfscanner import retention
from shelfscanner.retention import (
    Candidate,
    Summary,
    add_parser,
    has_set_column,
    is_exempt,
    retention_days,
    run_retention,
    select_candidates,
)
from shelfscanner.settings import PHOTO_BUCKET

NOW = datetime(2026, 9, 2, 12, 0, tzinfo=UTC)


def days_ago(n: float) -> str:
    return (NOW - timedelta(days=n)).isoformat()


class _Result:
    def __init__(self, data):
        self.data = data


class FakeQuery:
    """Records the chain of calls; `execute` answers from the fake table."""

    def __init__(self, table: FakeTable):
        self._table = table
        self.op: tuple | None = None
        self.filters: list[tuple] = []
        self._negate = False

    # builders -------------------------------------------------------------
    def select(self, columns):
        self.op = ("select", columns)
        return self

    def update(self, payload):
        self.op = ("update", dict(payload))
        return self

    def limit(self, n):
        self.filters.append(("limit", n))
        return self

    def order(self, column):
        self.filters.append(("order", column))
        return self

    @property
    def not_(self):
        self._negate = True
        return self

    def _filter(self, name, column, value):
        self.filters.append((("not." if self._negate else "") + name, column, value))
        self._negate = False
        return self

    def is_(self, column, value):
        return self._filter("is", column, value)

    def lt(self, column, value):
        return self._filter("lt", column, value)

    def eq(self, column, value):
        return self._filter("eq", column, value)

    def or_(self, expr):
        self.filters.append(("or", expr))
        return self

    # execution ------------------------------------------------------------
    def execute(self):
        self._table.queries.append(self)
        kind, arg = self.op
        if kind == "select":
            if "set" in [c.strip() for c in arg.split(",")] and not self._table.set_column:
                raise APIError({"message": "column photos.set does not exist", "code": "42703",
                                "hint": None, "details": None})
            return _Result([dict(r) for r in self._table.rows])
        if kind == "update":
            ids = [v for f, c, v in (x for x in self.filters if len(x) == 3) if f == "eq" and c == "id"]
            assert ids, "an update without an id filter would touch every row"
            touched = []
            for row in self._table.rows:
                if row["id"] in ids:
                    row.update(arg)
                    touched.append(dict(row))
            self._table.updates.append((ids, arg))
            return _Result(touched)
        raise AssertionError(f"unexpected op {kind}")


class FakeTable:
    def __init__(self, rows, set_column):
        self.rows = rows
        self.set_column = set_column
        self.queries: list[FakeQuery] = []
        self.updates: list[tuple] = []

    def query(self):
        return FakeQuery(self)


class FakeBucket:
    def __init__(self, name, log, fail_on):
        self.name = name
        self.log = log
        self.fail_on = fail_on

    def remove(self, paths):
        for p in paths:
            if p in self.fail_on:
                raise RuntimeError(f"storage says no to {p}")
        self.log.append((self.name, list(paths)))
        return [{"name": p} for p in paths]


class FakeStorage:
    def __init__(self, fail_on):
        self.removed: list[tuple] = []
        self.fail_on = fail_on

    def from_(self, bucket):
        return FakeBucket(bucket, self.removed, self.fail_on)


class FakeClient:
    def __init__(self, rows, *, set_column=True, fail_remove=()):
        self.photos = FakeTable([dict(r) for r in rows], set_column)
        self.storage = FakeStorage(set(fail_remove))

    def table(self, name):
        assert name == "photos"
        return self.photos.query()


def row(id, *, age_days, titles=(), set=None, storage_path="auto", created_at=None):
    return {
        "id": id,
        "storage_path": f"photo{id}.jpg" if storage_path == "auto" else storage_path,
        "titles": list(titles),
        "created_at": created_at or days_ago(age_days),
        **({"set": set} if set is not None else {}),
    }


# A mixed table: only rows 1 and 8 may lose their object.
MIXED = [
    row(1, age_days=31),                                  # old, unlabelled, default set: delete
    row(2, age_days=400, titles=["Dune"]),                # labelled: the test set, keep
    row(3, age_days=400, set="sourced"),                  # sourced test set, unlabelled: keep
    row(4, age_days=400, set="derived"),                  # derived test set: keep
    row(5, age_days=400, titles=["Dune"], set="core"),    # labelled core: keep
    row(6, age_days=3),                                   # too young: keep
    row(7, age_days=400, storage_path=None),              # already deleted: nothing to do
    row(8, age_days=31, set="core"),                      # explicit default set: delete
]


# --- window -----------------------------------------------------------------

def test_window_defaults_to_thirty_days():
    assert retention_days({}) == 30
    assert retention_days({"SHELFSCANNER_RETENTION_DAYS": ""}) == 30


def test_window_reads_the_environment():
    assert retention_days({"SHELFSCANNER_RETENTION_DAYS": "7"}) == 7
    assert retention_days({"SHELFSCANNER_RETENTION_DAYS": " 45 "}) == 45


@pytest.mark.parametrize("bad", ["soon", "0", "-3", "1.5"])
def test_window_rejects_nonsense(bad):
    with pytest.raises(SystemExit):
        retention_days({"SHELFSCANNER_RETENTION_DAYS": bad})


# --- exemptions ---------------------------------------------------------------

def test_labelled_rows_are_exempt_whatever_their_set():
    assert is_exempt({"titles": ["Dune"]}, set_column=True)
    assert is_exempt({"titles": ["Dune"], "set": "core"}, set_column=True)
    assert is_exempt({"titles": ["Dune"]}, set_column=False)


def test_non_default_set_is_exempt_even_without_titles():
    assert is_exempt({"titles": [], "set": "sourced"}, set_column=True)
    assert is_exempt({"titles": [], "set": "derived"}, set_column=True)
    assert is_exempt({"titles": [], "set": "anything-else"}, set_column=True)


def test_unlabelled_default_set_is_not_exempt():
    assert not is_exempt({"titles": []}, set_column=True)
    assert not is_exempt({"titles": [], "set": None}, set_column=True)
    assert not is_exempt({"titles": [], "set": "core"}, set_column=True)
    assert not is_exempt({"titles": []}, set_column=False)


def test_has_set_column_probes_with_a_select():
    assert has_set_column(FakeClient([], set_column=True))
    assert not has_set_column(FakeClient([], set_column=False))


# --- selection ----------------------------------------------------------------

def test_selection_keeps_every_exempt_row_even_when_the_server_returns_them():
    client = FakeClient(MIXED)
    cutoff = NOW - timedelta(days=30)
    got = select_candidates(client, cutoff)
    assert [c.id for c in got] == [1, 8]
    assert got[0] == Candidate(1, "photo1.jpg", datetime.fromisoformat(days_ago(31)))


def test_selection_asks_the_server_for_the_same_rules():
    client = FakeClient(MIXED)
    cutoff = NOW - timedelta(days=30)
    select_candidates(client, cutoff)
    q = client.photos.queries[-1]
    assert q.op == ("select", "id, storage_path, titles, created_at, set")
    assert ("not.is", "storage_path", "null") in q.filters
    assert ("lt", "created_at", cutoff.isoformat()) in q.filters
    assert ("eq", "titles", "{}") in q.filters
    assert ("or", "set.is.null,set.eq.core") in q.filters


def test_selection_without_a_set_column_ignores_set():
    rows = [r for r in MIXED if "set" not in r]
    client = FakeClient(rows, set_column=False)
    got = select_candidates(client, NOW - timedelta(days=30))
    assert [c.id for c in got] == [1]
    q = client.photos.queries[-1]
    assert q.op == ("select", "id, storage_path, titles, created_at")
    assert not any(f[0] == "or" for f in q.filters)


def test_selection_boundary_is_strictly_older_than_cutoff():
    cutoff = NOW - timedelta(days=30)
    rows = [
        row(1, age_days=0, created_at=cutoff.isoformat()),
        row(2, age_days=0, created_at=(cutoff - timedelta(seconds=1)).isoformat()),
        row(3, age_days=0, created_at=(cutoff + timedelta(seconds=1)).isoformat()),
    ]
    got = select_candidates(FakeClient(rows), cutoff)
    assert [c.id for c in got] == [2]


def test_selection_reads_postgrest_timestamps():
    z = (NOW - timedelta(days=40)).strftime("%Y-%m-%dT%H:%M:%S.123456Z")
    rows = [row(1, age_days=0, created_at=z), row(2, age_days=0, created_at="2026-07-01T00:00:00+00:00")]
    got = select_candidates(FakeClient(rows), NOW - timedelta(days=30))
    assert [c.id for c in got] == [1, 2]
    assert got[0].created_at.tzinfo is not None


# --- the job ------------------------------------------------------------------

def test_dry_run_lists_and_touches_nothing():
    client = FakeClient(MIXED)
    s = run_retention(NOW, dry_run=True, days=30, client=client)
    assert s.dry_run and s.window_days == 30 and s.cutoff == NOW - timedelta(days=30)
    assert [c.id for c in s.candidates] == [1, 8]
    assert s.deleted == [] and s.failed == [] and s.ok
    assert client.storage.removed == []
    assert client.photos.updates == []
    assert all(q.op[0] == "select" for q in client.photos.queries)
    text = "\n".join(s.lines())
    assert "would delete" in text and "photo1.jpg" in text and "photo8.jpg" in text
    assert "photo2.jpg" not in text


def test_run_removes_objects_then_nulls_paths_and_stamps_the_time():
    client = FakeClient(MIXED)
    s = run_retention(NOW, days=30, client=client)
    assert [c.id for c in s.deleted] == [1, 8] and s.ok
    assert client.storage.removed == [(PHOTO_BUCKET, ["photo1.jpg"]), (PHOTO_BUCKET, ["photo8.jpg"])]
    assert client.photos.updates == [
        ([1], {"storage_path": None, "photo_deleted_at": NOW.isoformat()}),
        ([8], {"storage_path": None, "photo_deleted_at": NOW.isoformat()}),
    ]
    by_id = {r["id"]: r for r in client.photos.rows}
    assert by_id[1]["storage_path"] is None and by_id[8]["storage_path"] is None
    # Everything exempt or young is exactly as it was.
    for i in (2, 3, 4, 5, 6):
        assert by_id[i]["storage_path"] == f"photo{i}.jpg" and "photo_deleted_at" not in by_id[i]
    assert s.lines()[-1] == "2 deleted, 0 failed"


def test_window_from_environment_when_days_not_given(monkeypatch):
    monkeypatch.setenv("SHELFSCANNER_RETENTION_DAYS", "10")
    client = FakeClient([row(1, age_days=11), row(2, age_days=9)])
    s = run_retention(NOW, dry_run=True, client=client)
    assert s.window_days == 10 and [c.id for c in s.candidates] == [1]


def test_a_failed_removal_keeps_its_row_and_fails_the_run():
    client = FakeClient(MIXED, fail_remove={"photo1.jpg"})
    s = run_retention(NOW, days=30, client=client)
    assert [c.id for c in s.deleted] == [8]
    assert [(c.id, err) for c, err in s.failed] == [(1, "RuntimeError: storage says no to photo1.jpg")]
    assert not s.ok
    by_id = {r["id"]: r for r in client.photos.rows}
    assert by_id[1]["storage_path"] == "photo1.jpg" and "photo_deleted_at" not in by_id[1]
    assert client.photos.updates == [([8], {"storage_path": None, "photo_deleted_at": NOW.isoformat()})]
    assert any(line.startswith("FAILED") and "photo1.jpg" in line for line in s.lines())


def test_run_with_nothing_to_do():
    client = FakeClient([row(2, age_days=400, titles=["Dune"])])
    s = run_retention(NOW, days=30, client=client)
    assert s.candidates == [] and s.ok and client.storage.removed == []


def test_now_must_be_timezone_aware():
    with pytest.raises(ValueError):
        run_retention(datetime(2026, 9, 2), days=30, client=FakeClient([]))  # noqa: DTZ001 - the point


# --- cli ----------------------------------------------------------------------

def _parser():
    parser = argparse.ArgumentParser()
    photos = parser.add_subparsers(dest="photos_command", required=True)
    add_parser(photos)
    return parser


def test_add_parser_defines_photos_retain():
    args = _parser().parse_args(["retain"])
    assert args.dry_run is False and args.days is None and args.func is retention._retain
    args = _parser().parse_args(["retain", "--dry-run", "--days", "7"])
    assert args.dry_run is True and args.days == 7


def test_retain_command_exits_nonzero_when_a_deletion_failed(monkeypatch, capsys):
    cutoff = NOW - timedelta(days=30)
    bad = Candidate(1, "photo1.jpg", cutoff - timedelta(days=1))
    failed = Summary(30, cutoff, False, candidates=[bad], failed=[(bad, "boom")])
    seen = {}

    def fake_run(now=None, dry_run=False, *, days=None, client=None):
        seen.update(dry_run=dry_run, days=days)
        return failed

    monkeypatch.setattr(retention, "run_retention", fake_run)
    with pytest.raises(SystemExit) as exc:
        retention._retain(argparse.Namespace(dry_run=True, days=5))
    assert exc.value.code == 1 and seen == {"dry_run": True, "days": 5}
    assert "FAILED" in capsys.readouterr().out
