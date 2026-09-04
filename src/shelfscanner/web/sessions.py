"""Device sessions (003): a random cookie token, a `sessions` row, only the hash stored.

The middleware is plain ASGI rather than Starlette's BaseHTTPMiddleware so it
does not interfere with the streaming responses the events endpoint returns.
"""

from __future__ import annotations

import hashlib
import secrets
from datetime import UTC, datetime
from typing import Protocol

from anyio import to_thread
from starlette.datastructures import Headers, MutableHeaders
from starlette.requests import cookie_parser
from starlette.routing import Match
from starlette.types import ASGIApp, Message, Receive, Scope, Send

COOKIE = "shelfscanner_session"
COOKIE_MAX_AGE = 365 * 24 * 3600
UNSESSIONED_PREFIXES = ("/static/", "/admin")  # /admin (009) has its own cookie
UNSESSIONED_PATHS = ("/", "/privacy-policy", "/terms-conditions", "/contact")  # 012 D1, 013 D3: no row, no cookie
# for the homepage and the static pages; a visitor becomes a session at /books
LAST_SEEN_THROTTLE_S = 600  # 008: `last_seen_at` is written at most once per ten minutes per session
# 017 D2: a request that must already carry a session. The upload form cannot be reached without one
# (the page redirects to /books, which sets it), so a cookieless POST /scan is a script: no row is
# created for it and `session_id` is left unset; the route refuses it.
NO_FRESH_SESSION = (("POST", "/scan"),)


def should_touch(last_seen_at: datetime | str | None, now: datetime) -> bool:
    """Whether `last_seen_at` is due a write: never seen, or seen `LAST_SEEN_THROTTLE_S` or more ago.
    Accepts the column's ISO string as the database returns it."""
    if last_seen_at is None:
        return True
    if isinstance(last_seen_at, str):
        last_seen_at = datetime.fromisoformat(last_seen_at.replace("Z", "+00:00"))
    if last_seen_at.tzinfo is None:
        last_seen_at = last_seen_at.replace(tzinfo=UTC)
    return (now - last_seen_at).total_seconds() >= LAST_SEEN_THROTTLE_S


class SessionStore(Protocol):
    """Where sessions live. `find` also records that the session was seen, throttled per
    `should_touch`."""

    def find(self, token_hash: str) -> int | None: ...

    def create(self, token_hash: str) -> int: ...


def new_token() -> str:
    return secrets.token_urlsafe(32)


def sha256_hex(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()


def hash_token(token: str) -> str:
    return sha256_hex(token)


def cookie_header(token: str, *, secure: bool = False) -> str:
    """The Set-Cookie value. `Secure` only when the request came over https (010): the deployed app
    is only ever https, but on the local network the phone reaches the laptop over plain http, and a
    Secure cookie would be dropped there."""
    flags = "; Secure" if secure else ""
    return f"{COOKIE}={token}; Max-Age={COOKIE_MAX_AGE}; Path=/; HttpOnly; SameSite=Lax{flags}"


def is_https(scope: Scope) -> bool:
    """Whether the client reached us over https: the scheme uvicorn saw, or the one the proxy in
    front of the function reports in `x-forwarded-proto` (Vercel terminates TLS and forwards http)."""
    if scope.get("scheme") == "https":
        return True
    forwarded = Headers(scope=scope).get("x-forwarded-proto", "")
    return forwarded.split(",")[0].strip().lower() == "https"


# --- change 017 (D1): the client address, for the per-address scan limit ---


def client_address(scope: Scope) -> str | None:
    """The address the request came from: the first value of `x-forwarded-for` (Vercel sets it from
    the connection in front of the function), else the socket peer (uvicorn on the laptop). None
    when neither is known, so the limit is skipped rather than counted against an empty string."""
    forwarded = Headers(scope=scope).get("x-forwarded-for", "")
    first = forwarded.split(",")[0].strip()
    if first:
        return first
    client = scope.get("client")
    return client[0] if client and client[0] else None


def hash_address(address: str) -> str:
    return sha256_hex(address)


def client_hash(scope: Scope) -> str | None:
    address = client_address(scope)
    return hash_address(address) if address else None


# --- end change 017 ---


class SupabaseSessions:
    def find(self, token_hash: str) -> int | None:
        from shelfscanner.db import get_client

        client = get_client()
        res = client.table("sessions").select("id, last_seen_at").eq("token_hash", token_hash).execute()
        if not res.data:
            return None
        session_id = res.data[0]["id"]
        now = datetime.now(UTC)
        if should_touch(res.data[0].get("last_seen_at"), now):
            client.table("sessions").update({"last_seen_at": now.isoformat()}).eq("id", session_id).execute()
        return session_id

    def create(self, token_hash: str) -> int:
        from shelfscanner.db import get_client

        res = get_client().table("sessions").insert({"token_hash": token_hash}).execute()
        return res.data[0]["id"]


class SessionMiddleware:
    """Resolve or create the device session and expose its id as `request.state.session_id`."""

    def __init__(self, app: ASGIApp, store: SessionStore, routes: list | None = None) -> None:
        self.app = app
        self.store = store
        self.routes = routes  # the app's routes: a request no route serves gets no session row

    def routed(self, scope: Scope) -> bool:
        """Whether some route fully matches the request. A 404 (a crawler, `/favicon.ico`, a typo) must
        not insert a `sessions` row and set a cookie; only pages and endpoints do."""
        if self.routes is None:
            return True
        return any(route.matches(scope)[0] == Match.FULL for route in self.routes)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if (scope["type"] != "http" or scope["path"] in UNSESSIONED_PATHS or scope["path"].startswith(UNSESSIONED_PREFIXES)
                or not self.routed(scope)):
            await self.app(scope, receive, send)
            return

        cookies = cookie_parser(Headers(scope=scope).get("cookie", ""))
        token = cookies.get(COOKIE)
        session_id = await to_thread.run_sync(self.store.find, hash_token(token)) if token else None
        fresh_token: str | None = None
        if session_id is None and (scope["method"], scope["path"]) not in NO_FRESH_SESSION:
            fresh_token = new_token()
            session_id = await to_thread.run_sync(self.store.create, hash_token(fresh_token))
        scope.setdefault("state", {})["session_id"] = session_id  # None only for NO_FRESH_SESSION (017 D2)

        async def send_with_cookie(message: Message) -> None:
            if message["type"] == "http.response.start" and fresh_token is not None:
                MutableHeaders(scope=message).append("set-cookie",
                                                     cookie_header(fresh_token, secure=is_https(scope)))
            await send(message)

        await self.app(scope, receive, send_with_cookie)
