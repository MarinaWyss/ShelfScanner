"""The feedback metrics (005): saves per scan and not-for-me marks per pick, from the rows.

`compute` is pure over rows shaped like the tables so it is tested on the fake
store; `save_rate` fetches the rows. The scoping doc's success metric is a save
per scan, so a "scan" here is a recommendation row without an error: one that
put picks on a screen.
"""

from __future__ import annotations

from dataclasses import dataclass

from shelfscanner.recommend import recs_from
from shelfscanner.web.pipeline import NOT_FOR_ME


@dataclass(frozen=True)
class SaveRate:
    scans: int  # recommendation rows that produced picks
    picks: int  # picks across those rows
    saves: int  # picks currently saved (a live `saved` row)
    not_for_me: int  # picks marked not for me, counted once per pick

    @property
    def saves_per_scan(self) -> float | None:
        return self.saves / self.scans if self.scans else None

    @property
    def not_for_me_per_pick(self) -> float | None:
        return self.not_for_me / self.picks if self.picks else None

    def line(self) -> str:
        per_scan = f"{self.saves_per_scan:.2f}" if self.saves_per_scan is not None else "-"
        per_pick = f"{self.not_for_me_per_pick:.2f}" if self.not_for_me_per_pick is not None else "-"
        return (f"save rate {per_scan} per scan ({self.saves} saves / {self.scans} scans); "
                f"not for me {per_pick} per pick ({self.not_for_me} / {self.picks} picks)")


def compute(recommendations: list[dict], saved: list[dict], feedback: list[dict]) -> SaveRate:
    """`recommendations` rows carry `id`, `parsed_recommendations`, `error`; `saved` rows
    `recommendation_id`, `pick_index`, `removed_at`; `feedback` rows `recommendation_id`, `pick_index`,
    `kind`. Rows for recommendations outside the first list are ignored."""
    scans = {r["id"]: len(recs_from(r["parsed_recommendations"])) for r in recommendations if not r.get("error")}
    saves = {(s["recommendation_id"], s["pick_index"]) for s in saved
             if s["recommendation_id"] in scans and s.get("removed_at") is None}
    marks = {(f["recommendation_id"], f["pick_index"]) for f in feedback
             if f["recommendation_id"] in scans and f["kind"] == NOT_FOR_ME}
    return SaveRate(scans=len(scans), picks=sum(scans.values()), saves=len(saves), not_for_me=len(marks))


def save_rate(session_id: int | None = None) -> SaveRate:
    """Over every session's scans, or one session's."""
    from shelfscanner.db import get_client

    c = get_client()
    recs = c.table("recommendations").select("id, parsed_recommendations, error, extractions!inner(photos!inner(session_id))")
    saved = c.table("saved").select("recommendation_id, pick_index, removed_at")
    feedback = c.table("feedback").select("recommendation_id, pick_index, kind")
    if session_id is not None:
        recs = recs.eq("extractions.photos.session_id", session_id)
        saved = saved.eq("session_id", session_id)
        feedback = feedback.eq("session_id", session_id)
    else:
        recs = recs.not_.is_("extractions.photos.session_id", "null")  # test-set runs are not scans
    return compute(recs.execute().data, saved.execute().data, feedback.execute().data)
