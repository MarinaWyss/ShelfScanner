"""Change 011: prompt versions side by side, the eval in one command, and promoting a real scan."""

from __future__ import annotations

import json
import re
from types import SimpleNamespace

import pytest

from research import check, report
from research import eval as research_eval
from shelfscanner import storage

# --- report --by-prompt --------------------------------------------------------------------------

PICKS = {1: ["Dune", "Emma"], 2: ["Dune", "Emma"], 3: ["Dune", ["Emma", "Persuasion"]], 4: ["Dune"], 5: ["Dune"]}
_ids = iter(range(100, 10_000))


def rec(photo, prompt, titles, *, prefs=None, adapter="openai", valid=None, error=None, ms=3000, cost=0.002):
    return {"id": next(_ids), "extraction_id": photo * 10, "model": "openai/gpt-5.4-mini", "adapter": adapter,
            "prompt_version": f"{prompt}.md", "preferences": prefs or {"genres": ["x"]}, "error": error,
            "parsed_recommendations": None if error else {"recommendations": [{"title": t, "reason": ""} for t in titles]},
            "valid_vs_extraction": None if error else (len(titles) if valid is None else valid),
            "latency_ms": ms, "cost_usd": cost}


PHOTO_OF = {p * 10: p for p in range(1, 6)}
EXPORT = {"genres": ["x"], "rated_books": [{"title": "Dracula", "author": "Stoker", "rating": 5}]}


def test_by_prompt_groups_by_prompt_and_preferences_shape_and_takes_the_latest_run():
    recs = [rec(1, "recommend_v1", ["Dune", "A", "B", "C", "D"]),
            rec(1, "recommend_v1", ["Dune", "Emma", "B", "C", "D"]),  # later run for the same photo wins
            rec(2, "recommend_v1", ["A", "B", "C", "D", "E"]),
            rec(1, "recommend_v3", ["Dune", "Emma", "B", "C", "D"], prefs=EXPORT),
            rec(2, "recommend_v3", ["Dune", "B", "C", "D", "E"], prefs=EXPORT, valid=3),
            rec(3, "recommend_v3", None, prefs=EXPORT, error="expected 5 recommendations, got 6")]
    stats = report.by_prompt(recs, PHOTO_OF, PICKS, 0.85)
    assert [(s.prompt, s.prefs, s.adapter, s.runs, s.errors) for s in stats] == [
        ("recommend_v1", "flat", "openai", 2, 0), ("recommend_v3", "export", "openai", 2, 1)]
    v1, v3 = stats
    assert v1.overlap == {1: 2, 2: 0} and v1.mean_overlap == 1.0 and v1.median_overlap == 1.0 and v1.on_list == 1.0
    assert v3.overlap == {1: 2, 2: 1} and v3.on_list == pytest.approx(8 / 10)
    text = report.render_by_prompt(stats, "gpt-5.4-mini", None)
    assert re.search(r"recommend_v3\s+export\s+openai\s+2\s+1\s+0\.80\s+2\s+1\s+1\.50\s+1\.5", text)


def test_by_prompt_summary_over_chosen_photos_only():
    recs = [rec(p, "recommend_v3", ["Dune", "Emma", "B", "C", "D"]) for p in (1, 2, 5)]
    s = report.by_prompt(recs, PHOTO_OF, PICKS, 0.85, summary_photos=[1, 2])[0]
    assert s.overlap == {1: 2, 2: 2, 5: 1} and s.mean_overlap == 2.0


# --- research.eval ----------------------------------------------------------------------------------


def test_eval_runs_both_stages_then_the_check_and_returns_its_verdict(monkeypatch):
    calls = []
    monkeypatch.setattr(research_eval.matrix, "run_vision", lambda aliases, max_dim, set_name: calls.append(("vision", aliases, set_name)))
    monkeypatch.setattr(research_eval.matrix, "run_llm", lambda aliases, prefs, prompt, set_name: calls.append(("llm", aliases, prompt, set_name)))
    monkeypatch.setattr(research_eval.check, "main", lambda argv: calls.append(("check", argv)) or 1)
    rc = research_eval.main(["--set", "core", "--reading-set", "all", "--reading", "sonnet", "--choosing", "haiku"])
    assert rc == 1
    assert calls == [("vision", ["sonnet"], "all"), ("llm", ["haiku"], "recommend_v3", "core"), ("check", ["--set", "core"])]


def test_eval_defaults_to_the_configured_primaries(monkeypatch):
    seen = {}
    monkeypatch.setattr(research_eval.matrix, "run_vision", lambda aliases, max_dim, set_name: seen.setdefault("reading", aliases[0]))
    monkeypatch.setattr(research_eval.matrix, "run_llm", lambda aliases, prefs, prompt, set_name: seen.setdefault("choosing", aliases[0]))
    monkeypatch.setattr(research_eval.check, "main", lambda argv: 0)
    from shelfscanner.config import load_config

    cfg = load_config()
    assert research_eval.main([]) == 0
    assert seen == {"reading": cfg.stage("reading").primary, "choosing": cfg.stage("choosing").primary}
    assert check.baseline_for("core")  # the default set has a baseline entry


# --- photos label ---------------------------------------------------------------------------------


class FakeQuery:
    def __init__(self, rows):
        self.rows, self.filters = rows, []

    def select(self, *a):
        return self

    def eq(self, col, val):
        self.filters.append((col, val))
        return self

    def execute(self):
        return SimpleNamespace(data=[r for r in self.rows if all(r.get(c) == v for c, v in self.filters)])


def promote_env(monkeypatch, tmp_path, row):
    photos_dir, labels_dir = tmp_path / "photos", tmp_path / "labels"
    monkeypatch.setattr(storage, "PHOTOS_DIR", photos_dir)
    monkeypatch.setattr(storage, "LABELS_DIR", labels_dir)
    monkeypatch.setattr(storage, "get_client", lambda: SimpleNamespace(table=lambda name: FakeQuery([row])))
    monkeypatch.setattr(storage, "download_photo", lambda path: b"\xff\xd8jpeg-bytes")
    uploaded, upserted = [], []
    monkeypatch.setattr(storage, "upload_photo", lambda local, path: uploaded.append((local.name, path)) or 12)
    monkeypatch.setattr(storage, "upsert_photo_row_with_extras",
                        lambda label, extras: upserted.append((label, extras)) or {"id": 99, "storage_path": label.storage_path, "set": extras["set"]})
    return photos_dir, labels_dir, uploaded, upserted


def test_promote_scan_copies_the_object_writes_the_label_and_upserts_a_real_row(monkeypatch, tmp_path):
    row = {"id": 142, "storage_path": "sessions/7/abc.jpg", "session_id": 7, "titles": None}
    photos_dir, labels_dir, uploaded, upserted = promote_env(monkeypatch, tmp_path, row)
    out = storage.promote_scan(142, ["Dune", "Emma"], ["Pers"], "living room", now="2026-09-03")
    assert out == {"id": 99, "storage_path": "real_scan142.jpg", "set": "real"}
    assert (photos_dir / "real_scan142.jpg").read_bytes() == b"\xff\xd8jpeg-bytes"
    label = json.loads((labels_dir / "real_scan142.json").read_text())
    assert label == {"titles": ["Dune", "Emma"], "partial": ["Pers"], "set": "real",
                     "source": {"scan_id": 142, "promoted_at": "2026-09-03"}, "notes": "living room"}
    assert uploaded == [("real_scan142.jpg", "real_scan142.jpg")]
    (parsed, extras), = upserted
    assert parsed.titles == ["Dune", "Emma"] and extras == {"set": "real", "source": label["source"]}


@pytest.mark.parametrize("row, message", [
    ({"id": 5, "storage_path": "core.jpg", "session_id": None, "titles": ["A"]}, "not an app scan"),
    ({"id": 6, "storage_path": None, "session_id": 7, "titles": None}, "no object any more"),
])
def test_promote_scan_refuses_test_set_rows_and_deleted_objects(monkeypatch, tmp_path, row, message):
    promote_env(monkeypatch, tmp_path, row)
    with pytest.raises(SystemExit, match=message):
        storage.promote_scan(row["id"], ["Dune"])
    assert not (tmp_path / "labels").exists()


def test_promote_scan_needs_a_title(monkeypatch, tmp_path):
    promote_env(monkeypatch, tmp_path, {"id": 1, "storage_path": "sessions/1/a.jpg", "session_id": 1, "titles": None})
    with pytest.raises(SystemExit, match="At least one title"):
        storage.promote_scan(1, [])
