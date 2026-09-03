"""Stage one: a vision model reads a photo, scored against its labels, logged to `extractions`."""

from __future__ import annotations

from dataclasses import dataclass

from shelfscanner import router, spend, storage
from shelfscanner.config import Model, load_config
from shelfscanner.db import get_client
from shelfscanner.images import resize
from shelfscanner.matching import score
from shelfscanner.router import ModelClient, Progress

DEFAULT_PROMPT = "extract_v1"


@dataclass(frozen=True)
class ExtractionRow:
    id: int
    photo_id: int
    model: str
    found: int
    missed: int
    invented: int
    partial: int
    latency_ms: int | None
    cost_usd: float | None
    error: str | None

    def line(self) -> str:
        status = f"ERROR {self.error}" if self.error else (
            f"found={self.found} missed={self.missed} invented={self.invented} partial={self.partial}")
        cost = f"${self.cost_usd:.4f}" if self.cost_usd is not None else "$?"
        return f"extraction {self.id:>3}  photo {self.photo_id}  {self.model:<28} {status}  {cost}  {self.latency_ms}ms"


def titles_from(parsed: object) -> list[str]:
    """Pull title strings out of the prompt's {"books": [{"title": ...}]} shape, tolerating drift."""
    if isinstance(parsed, dict):
        items = parsed.get("books") or parsed.get("titles") or []
    elif isinstance(parsed, list):
        items = parsed
    else:
        return []
    out: list[str] = []
    for it in items:
        if isinstance(it, dict) and isinstance(it.get("title"), str):
            out.append(it["title"])
        elif isinstance(it, str):
            out.append(it)
    return out


def extract_photo(photo: dict, model: Model, max_edge: int, prompt_name: str, *,
                  client: ModelClient | None = None, on_progress: Progress | None = None) -> ExtractionRow:
    cfg = load_config()
    prompt_version, prompt = router.load_prompt(prompt_name)
    img = resize(storage.download_photo(photo["storage_path"]), max_edge)
    if client is None:  # a fake client spends nothing
        spend.check_spend()
    res = router.vision(model, prompt, img.jpeg, client=client, on_progress=on_progress)

    extracted = titles_from(res.parsed) if res.ok else []
    s = score(extracted, photo["titles"], photo["partial_titles"], cfg.match_threshold)

    row = {
        "photo_id": photo["id"],
        "provider": res.provider,
        "adapter": res.adapter,
        "request_id": res.request_id,
        "model": model.slug,
        "prompt_version": prompt_version,
        "image_long_edge": max_edge,
        "image_width": img.width,
        "image_height": img.height,
        "raw_output": res.raw_text,
        "parsed_titles": res.parsed if res.ok else None,
        "found": s.found,
        "missed": s.missed,
        "invented": s.invented,
        "partial_matched": s.partial_matched,
        "found_count": len(s.found),
        "missed_count": len(s.missed),
        "invented_count": len(s.invented),
        "latency_ms": res.latency_ms,
        "input_tokens": res.input_tokens,
        "output_tokens": res.output_tokens,
        "cost_usd": res.cost_usd,
        "error": res.error,
    }
    inserted = get_client().table("extractions").insert(row).execute().data[0]
    return ExtractionRow(
        id=inserted["id"], photo_id=photo["id"], model=model.slug,
        found=len(s.found), missed=len(s.missed), invented=len(s.invented), partial=len(s.partial_matched),
        latency_ms=res.latency_ms, cost_usd=res.cost_usd, error=res.error,
    )


def resolve_photos(spec: str) -> list[dict]:
    if spec == "all":
        photos = storage.list_photos()
        if not photos:
            raise SystemExit("No photos synced. Run `shelfscanner photos sync` first.")
        return photos
    return [storage.get_photo(int(spec))]


def run_extract(photo_spec: str, model_name: str, max_edge: int | None, prompt_name: str) -> list[ExtractionRow]:
    cfg = load_config()
    model = cfg.model(model_name)
    edge = max_edge or cfg.default_max_edge
    return [extract_photo(p, model, edge, prompt_name) for p in resolve_photos(photo_spec)]


def get_extraction(extraction_id: int) -> dict:
    res = get_client().table("extractions").select("*").eq("id", extraction_id).execute()
    if not res.data:
        raise SystemExit(f"No extraction with id {extraction_id}")
    return res.data[0]
