"""The dashboard (009 task 2): `GET /admin?window=7|30|all`, the numbers of `web.metrics` as
server-rendered tables and two inline SVG sparklines, behind one shared secret.

With no `SHELFSCANNER_ADMIN_SECRET` in the environment the page is always a 404, so a
deployment that never set one exposes nothing. With one, `GET /admin` without the admin
cookie is a small form (017 D3); `POST /admin` with the right key sets the cookie and
redirects to the dashboard. The cookie is an HMAC of the secret, never the secret itself,
so a leaked cookie is a thirty-day pass and rotating the secret revokes every cookie.
The key is never read from the query string: a URL is logged and remembered, a form
body is not.
"""

from __future__ import annotations

import hashlib
import hmac
import os
import secrets
from datetime import datetime
from typing import Annotated

from anyio import to_thread
from dotenv import load_dotenv
from fastapi import APIRouter, Form, HTTPException, Request
from fastapi.responses import HTMLResponse, RedirectResponse

from shelfscanner.settings import REPO_ROOT
from shelfscanner.web import metrics
from shelfscanner.web.metrics import Dashboard, StageStats, Summary
from shelfscanner.web.render import render
from shelfscanner.web.sessions import is_https

router = APIRouter()

SECRET_ENV = "SHELFSCANNER_ADMIN_SECRET"
COOKIE = "shelfscanner_admin"
COOKIE_MAX_AGE = 30 * 24 * 3600
COOKIE_PURPOSE = b"shelfscanner-admin-v1"  # what the HMAC signs; bump to revoke every cookie without a new secret
WRONG_KEY = "That key is not right."
SPARK_WIDTH, SPARK_HEIGHT, SPARK_PAD = 240, 40, 2
WINDOW_LABELS = {"7": "Last 7 days", "30": "Last 30 days", "all": "All time"}
STAGE_LABELS = {"reading": "Reading", "checking": "Checking", "choosing": "Choosing"}
DASH = "–"


def secret() -> str:
    load_dotenv(REPO_ROOT / ".env")  # read here, not by way of another module's side effect
    return os.environ.get(SECRET_ENV, "")


def cookie_value(secret_value: str) -> str:
    """The admin cookie for this secret: derived, so the cookie never carries the secret (017 D3)."""
    return hmac.new(secret_value.encode("utf-8"), COOKIE_PURPOSE, hashlib.sha256).hexdigest()


def _same(given: str, expected: str) -> bool:
    # Bytes, not str: `compare_digest` raises on non-ASCII text, and a 500 would reveal the route.
    return secrets.compare_digest(given.encode("utf-8"), expected.encode("utf-8"))


def authorised(request: Request) -> bool:
    secret_value = secret()
    if not secret_value:
        return False
    given = request.cookies.get(COOKIE)
    return given is not None and _same(given, cookie_value(secret_value))


def _login_page(request: Request, *, status: int, wrong: bool = False) -> HTMLResponse:
    return HTMLResponse(render(request, "admin_login.html", error=WRONG_KEY if wrong else None), status_code=status)


@router.get("/admin")
async def admin(request: Request, window: str = metrics.DEFAULT_WINDOW):
    if not secret():
        raise HTTPException(status_code=404, detail="Not Found")
    if not authorised(request):
        return _login_page(request, status=200)
    if window not in metrics.WINDOWS:
        window = metrics.DEFAULT_WINDOW
    source: metrics.Source = request.app.state.metrics_source
    rows = await to_thread.run_sync(source, window)
    board = metrics.dashboard(rows, window)
    return HTMLResponse(render(request, "admin.html", **view(board)))


@router.post("/admin")
async def admin_login(request: Request, key: Annotated[str, Form()] = ""):
    """The key, posted once (017 D3). Right: the cookie and a redirect to the dashboard with no query
    string. Wrong: the form again, 403. No secret configured: the same 404 as the page."""
    secret_value = secret()
    if not secret_value:
        raise HTTPException(status_code=404, detail="Not Found")
    if not _same(key, secret_value):
        return _login_page(request, status=403, wrong=True)
    response = RedirectResponse("/admin", status_code=303)
    # `Secure` over https exactly as the session cookie (010); `Strict` because nothing links into /admin.
    response.set_cookie(COOKIE, cookie_value(secret_value), max_age=COOKIE_MAX_AGE, path="/admin", httponly=True,
                        samesite="strict", secure=is_https(request.scope))
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
