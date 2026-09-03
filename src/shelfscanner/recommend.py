"""Stage two: a language model picks five books from an extraction, checked per D5, logged to `recommendations`."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

from shelfscanner import router, spend
from shelfscanner.adapters.base import RECOMMENDATIONS_SCHEMA
from shelfscanner.config import Model, load_config
from shelfscanner.db import get_client
from shelfscanner.extract import get_extraction, titles_from
from shelfscanner.matching import similarity
from shelfscanner.router import ModelClient, Progress
from shelfscanner.storage import get_photo

DEFAULT_PROMPT = "recommend_v1"
EXPECTED = 5


@dataclass(frozen=True)
class Recommendation:
    title: str
    reason: str


@dataclass(frozen=True)
class Validity:
    vs_extraction: int  # recommendations matching a title the model was given (hard constraint)
    vs_ground_truth: int  # of those, matching a hand label too
    off_list: list[str]  # recommended titles matching nothing in the extraction


@dataclass(frozen=True)
class RecommendationRow:
    id: int
    extraction_id: int
    model: str
    recs: list[Recommendation]
    validity: Validity | None
    latency_ms: int | None
    cost_usd: float | None
    error: str | None

    def lines(self) -> list[str]:
        cost = f"${self.cost_usd:.4f}" if self.cost_usd is not None else "$?"
        if self.error:
            return [f"recommendation {self.id:>3}  extraction {self.extraction_id}  {self.model:<28} ERROR {self.error}  {cost}  {self.latency_ms}ms"]
        v = self.validity
        out = [f"recommendation {self.id:>3}  extraction {self.extraction_id}  {self.model:<28} "
               f"valid {v.vs_extraction}/{len(self.recs)} vs extraction, {v.vs_ground_truth}/{len(self.recs)} vs labels  {cost}  {self.latency_ms}ms"]
        for i, r in enumerate(self.recs, 1):
            flag = "" if not any(r.title == o for o in v.off_list) else "  [NOT ON LIST]"
            out.append(f"  {i}. {r.title}{flag}")
            out.append(f"     {r.reason}")
        return out


def load_prefs(path: Path) -> dict:
    prefs = json.loads(path.read_text())
    prefs.pop("_note", None)
    return prefs


def recs_from(parsed: object) -> list[Recommendation]:
    items = parsed.get("recommendations", []) if isinstance(parsed, dict) else (parsed if isinstance(parsed, list) else [])
    out = []
    for it in items:
        if isinstance(it, dict) and isinstance(it.get("title"), str):
            out.append(Recommendation(it["title"], str(it.get("reason", ""))))
    return out


def check(recs: list[Recommendation], extracted: list[str], labels: list[str], threshold: float) -> Validity:
    """D5: every title must match the extraction it was given; separately, count those also matching ground truth."""
    vs_ex = 0
    vs_gt = 0
    off: list[str] = []
    for r in recs:
        on_list = any(similarity(r.title, t) >= threshold for t in extracted)
        if on_list:
            vs_ex += 1
            if any(similarity(r.title, t) >= threshold for t in labels):
                vs_gt += 1
        else:
            off.append(r.title)
    return Validity(vs_ex, vs_gt, off)


def shelf_text(parsed_titles: object) -> str:
    """The extraction's books as a plain list for the prompt, with authors where the model gave them."""
    lines = []
    items = parsed_titles.get("books", []) if isinstance(parsed_titles, dict) else []
    for it in items:
        if isinstance(it, dict) and isinstance(it.get("title"), str):
            author = it.get("author")
            lines.append(f"- {it['title']}" + (f" — {author}" if isinstance(author, str) and author.strip() else ""))
    if not lines:
        lines = [f"- {t}" for t in titles_from(parsed_titles)]
    return "\n".join(lines)


def recommend_from_extraction(extraction: dict, model: Model | None, prefs: dict, prompt_name: str, *,
                              client: ModelClient | None = None, on_progress: Progress | None = None) -> RecommendationRow:
    cfg = load_config()
    prompt_version, prompt = router.load_prompt(prompt_name)
    extracted = titles_from(extraction["parsed_titles"])
    if not extracted:
        raise SystemExit(f"Extraction {extraction['id']} has no parsed titles (error: {extraction.get('error')})")
    labels = get_photo(extraction["photo_id"])["titles"]

    text = f"Books on the shelf:\n{shelf_text(extraction['parsed_titles'])}\n\nReading preferences:\n{prefs_text(prefs, prompt_name)}"
    if client is None:  # a fake client spends nothing
        spend.check_spend()
    sr = router.with_failover(
        "choosing", model,
        lambda m: router.text(m, prompt, text, client=client, on_progress=on_progress, schema=RECOMMENDATIONS_SCHEMA),
        on_progress=on_progress,
    )
    res, model = sr.result, sr.model

    recs = recs_from(res.parsed) if res.ok else []
    validity = check(recs, extracted, labels, cfg.match_threshold) if res.ok else None
    error = res.error
    if error is None and len(recs) != min(EXPECTED, len(extracted)):
        error = f"expected {min(EXPECTED, len(extracted))} recommendations, got {len(recs)}"

    row = {
        "extraction_id": extraction["id"],
        "provider": res.provider,
        "adapter": res.adapter,
        "request_id": res.request_id,
        "model": model.slug,
        "failover_from": sr.failover_from,
        "failover_error": sr.failover_error,
        "prompt_version": prompt_version,
        "preferences": prefs,
        "raw_output": res.raw_text,
        "parsed_recommendations": res.parsed if res.ok else None,
        "valid_vs_extraction": validity.vs_extraction if validity else None,
        "valid_vs_ground_truth": validity.vs_ground_truth if validity else None,
        "latency_ms": res.latency_ms,
        "input_tokens": res.input_tokens,
        "output_tokens": res.output_tokens,
        "cost_usd": res.cost_usd,
        "error": error,
    }
    inserted = get_client().table("recommendations").insert(row).execute().data[0]
    return RecommendationRow(inserted["id"], extraction["id"], model.slug, recs, validity,
                             res.latency_ms, res.cost_usd, error)


RUBRIC = {1, 2, 3}  # D6: 1 generic, 2 references a preference, 3 a preference and something specific about the book


def set_specificity(recommendation_id: int, scores: list[int]) -> dict:
    """Write hand-entered specificity scores, one per recommendation in the row, in order."""
    bad = [s for s in scores if s not in RUBRIC]
    if bad:
        raise SystemExit(f"Scores must be 1, 2 or 3; got {bad}")
    c = get_client()
    res = c.table("recommendations").select("id, parsed_recommendations, error").eq("id", recommendation_id).execute()
    if not res.data:
        raise SystemExit(f"No recommendation with id {recommendation_id}")
    row = res.data[0]
    n = len(recs_from(row["parsed_recommendations"]))
    if len(scores) != n:
        raise SystemExit(f"Recommendation {recommendation_id} has {n} titles; got {len(scores)} scores")
    return c.table("recommendations").update({"specificity_scores": scores}).eq("id", recommendation_id).execute().data[0]


def run_recommend(extraction_id: int, model_name: str | None, prefs_ref: str | Path, prompt_name: str) -> RecommendationRow:
    from shelfscanner import preferences  # local import: preferences imports this module's helpers

    model = load_config().model(model_name) if model_name else None  # None: the choosing stage's primary, with failover
    return recommend_from_extraction(get_extraction(extraction_id), model, preferences.load(prefs_ref), prompt_name)


# --- change 004 ---
def prefs_text(prefs: dict, prompt_name: str) -> str:
    """The "Reading preferences" section (docs/specs/preferences.md).

    The flat shape with `recommend_v1` is sent as JSON, exactly as change 001 did. A structured object
    is laid out as labelled lists whatever the prompt; the flat shape is upgraded first for any other prompt.
    """
    from shelfscanner import preferences

    if prompt_name == DEFAULT_PROMPT and not preferences.is_v2(prefs):
        return json.dumps(prefs, indent=2, ensure_ascii=False)
    return preferences.as_text(preferences.upgrade(prefs))
