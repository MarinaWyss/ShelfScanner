"""The dashboard (009 task 2): `GET /admin?window=7|30|all`, the numbers of `web.metrics` as
server-rendered tables and two inline SVG sparklines, behind one shared secret.

The page is a 404 unless the request carries `?key=` or the admin cookie matching
`SHELFSCANNER_ADMIN_SECRET`; with no secret in the environment it is always a 404,
so a deployment that never set one exposes nothing. An authorised response sets
the cookie, so the window links need no key.
"""

from __future__ import annotations

import os
import secrets
from datetime import datetime

from anyio import to_thread
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import HTMLResponse

from shelfscanner.web import metrics
from shelfscanner.web.metrics import Dashboard, StageStats, Summary

router = APIRouter()

SECRET_ENV = "SHELFSCANNER_ADMIN_SECRET"
COOKIE = "shelfscanner_admin"
COOKIE_MAX_AGE = 30 * 24 * 3600
SPARK_WIDTH, SPARK_HEIGHT, SPARK_PAD = 240, 40, 2
WINDOW_LABELS = {"7": "Last 7 days", "30": "Last 30 days", "all": "All time"}
STAGE_LABELS = {"reading": "Reading", "checking": "Checking", "choosing": "Choosing"}
DASH = "–"


def authorised(request: Request) -> bool:
    secret = os.environ.get(SECRET_ENV, "")
    if not secret:
        return False
    given = (request.query_params.get("key"), request.cookies.get(COOKIE))
    return any(g is not None and secrets.compare_digest(g, secret) for g in given)


@router.get("/admin")
async def admin(request: Request, window: str = metrics.DEFAULT_WINDOW):
    if not authorised(request):
        raise HTTPException(status_code=404, detail="Not Found")
    if window not in metrics.WINDOWS:
        window = metrics.DEFAULT_WINDOW
    source: metrics.Source = request.app.state.metrics_source
    rows = await to_thread.run_sync(source, window)
    board = metrics.dashboard(rows, window)
    html = request.app.state.templates.get_template("admin.html").render(**view(board))
    response = HTMLResponse(html)
    # No `Secure` until the app is served over https (010), like the session cookie.
    response.set_cookie(COOKIE, os.environ[SECRET_ENV], max_age=COOKIE_MAX_AGE, path="/admin", httponly=True,
                        samesite="lax")
    return response


# --- the view: every number already a string, so the template only lays them out ------------------


def spark_points(values: list[float | None], width: int = SPARK_WIDTH, height: int = SPARK_HEIGHT,
                 pad: int = SPARK_PAD) -> str:
    """`points` for an SVG polyline: one x per value, y scaled to the series' maximum, missing values
    skipped. Empty when nothing can be drawn."""
    known = [(i, v) for i, v in enumerate(values) if v is not None]
    if not known:
        return ""
    top = max(v for _, v in known) or 1
    step = (width - 2 * pad) / max(len(values) - 1, 1)
    return " ".join(f"{pad + i * step:.1f},{height - pad - (v / top) * (height - 2 * pad):.1f}" for i, v in known)


def fmt_rate(v: float | None) -> str:
    return DASH if v is None else f"{v * 100:.0f}%"


def fmt_ratio(v: float | None) -> str:
    return DASH if v is None else f"{v:.2f}"


def fmt_ms(v: float | None) -> str:
    if v is None:
        return DASH
    return f"{v / 1000:.1f} s" if v >= 1000 else f"{v:.0f} ms"


def fmt_usd(v: float | None) -> str:
    return DASH if v is None else f"${v:.4f}"


def fmt_count(n: int, of: int | None = None) -> str:
    return f"{n} / {of}" if of is not None else str(n)


def fmt_day(d: datetime) -> str:
    return d.strftime("%-d %b")


def _stage_rows(stages: dict[str, StageStats]) -> list[dict]:
    return [{"stage": STAGE_LABELS[s.stage], "rows": str(s.rows), "p50": fmt_ms(s.p50_ms), "p95": fmt_ms(s.p95_ms),
             "cost": fmt_usd(s.cost_per_scan), "spend": DASH if s.stage == "checking" else fmt_usd(s.spend_usd),
             "errors": str(s.errors), "failovers": DASH if s.stage == "checking" else str(s.failovers)}
            for s in stages.values()]


def _pair(label: str, fn, app: Summary, labelled: Summary) -> dict:
    return {"label": label, "app": fn(app), "labelled": fn(labelled)}


def view(board: Dashboard) -> dict:
    app, lab = board.app, board.labelled
    if board.start is not None:
        span = f"{fmt_day(board.start)} to {fmt_day(board.end)} {board.end.year}, UTC days"
    else:
        span = f"everything up to {fmt_day(board.end)} {board.end.year}"
    prices = board.prices
    if prices.checked is None:
        price_line = "Model prices carry no check date in config/models.toml."
    else:
        days = "1 day" if prices.age_days == 1 else f"{prices.age_days} days"
        price_line = f"Model prices last checked {prices.checked.isoformat()}, {days} ago"
        price_line += f"; older than {metrics.PRICE_STALE_DAYS} days, check them." if prices.stale else "."
    return {
        "window": board.window,
        "window_label": WINDOW_LABELS[board.window],
        "span": span,
        "windows": [{"key": k, "label": WINDOW_LABELS[k], "current": k == board.window} for k in metrics.WINDOWS],
        "sparks": [
            {"id": "spark-scans", "label": "Scans per day", "points": spark_points([d.scans for d in app.days]),
             "last": str(app.days[-1].scans) if app.days else DASH, "width": SPARK_WIDTH, "height": SPARK_HEIGHT},
            {"id": "spark-save-rate", "label": "Save rate per day",
             "points": spark_points([d.save_rate for d in app.days]),
             "last": fmt_ratio(app.days[-1].save_rate) if app.days else DASH, "width": SPARK_WIDTH,
             "height": SPARK_HEIGHT},
        ],
        "overview": [
            _pair("Scans started", lambda s: str(s.scans_started), app, lab),
            _pair("Scans per day", lambda s: fmt_ratio(s.scans_per_day), app, lab),
            _pair("Scans with picks", lambda s: str(s.feedback.scans), app, lab),
            _pair("Completion rate", lambda s: fmt_rate(s.completion_rate), app, lab),
            _pair("Saves per scan", lambda s: fmt_ratio(s.feedback.saves_per_scan), app, lab),
            _pair("Not-for-me per pick", lambda s: fmt_ratio(s.feedback.not_for_me_per_pick), app, lab),
        ],
        "stages": [{"id": "stages-app", "title": "App scans", "rows": _stage_rows(app.stages)},
                   {"id": "stages-labelled", "title": "Test set", "rows": _stage_rows(lab.stages)}],
        "errors": [
            _pair("Model failures (rows with an error)",
                  lambda s: f"{fmt_count(s.errors.model_failures, s.errors.model_rows)} ({fmt_rate(s.errors.model_rate)})",
                  app, lab),
            _pair("Application failures (scans that reached no model)",
                  lambda s: f"{fmt_count(s.errors.application_failures, s.errors.scans)} "
                            f"({fmt_rate(s.errors.application_rate)})", app, lab),
            _pair("Failovers", lambda s: str(sum(st.failovers for st in s.stages.values())), app, lab),
        ],
        "lookup": [
            _pair("Titles looked up", lambda s: str(s.lookups.looked_up), app, lab),
            _pair("Hit rate", lambda s: fmt_rate(s.lookups.hit_rate), app, lab),
            _pair("Cache hit rate", lambda s: "not recorded" if s.lookups.cache_hits is None
                  else fmt_rate(s.lookups.cache_hit_rate), app, lab),
            _pair("Catalogue errors (titles)", lambda s: str(s.lookups.errors), app, lab),
        ],
        "price_line": price_line,
        "price_stale": prices.stale,
    }
