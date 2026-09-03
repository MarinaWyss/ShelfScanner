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
from starlette.types import ASGIApp, Message, Receive, Scope, Send

COOKIE = "shelfscanner_session"
COOKIE_MAX_AGE = 365 * 24 * 3600
UNSESSIONED_PREFIXES = ("/static/",)
LAST_SEEN_THROTTLE_S = 600  # 008: `last_seen_at` is written at most once per ten minutes per session


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


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def cookie_header(token: str) -> str:
    # No `Secure`: until change 010 the app is reached over plain http on the local network.
    return f"{COOKIE}={token}; Max-Age={COOKIE_MAX_AGE}; Path=/; HttpOnly; SameSite=Lax"


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

    def __init__(self, app: ASGIApp, store: SessionStore) -> None:
        self.app = app
        self.store = store

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope["path"].startswith(UNSESSIONED_PREFIXES):
            await self.app(scope, receive, send)
            return

        cookies = cookie_parser(Headers(scope=scope).get("cookie", ""))
        token = cookies.get(COOKIE)
        session_id = await to_thread.run_sync(self.store.find, hash_token(token)) if token else None
        fresh_token: str | None = None
        if session_id is None:
            fresh_token = new_token()
            session_id = await to_thread.run_sync(self.store.create, hash_token(fresh_token))
        scope.setdefault("state", {})["session_id"] = session_id

        async def send_with_cookie(message: Message) -> None:
            if message["type"] == "http.response.start" and fresh_token is not None:
                MutableHeaders(scope=message).append("set-cookie", cookie_header(fresh_token))
            await send(message)

        await self.app(scope, receive, send_with_cookie)
