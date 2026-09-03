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
UNSESSIONED_PREFIXES = ("/static/", "/admin")  # /admin (009) has its own cookie


class SessionStore(Protocol):
    """Where sessions live. `find` also records that the session was seen."""

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
        res = client.table("sessions").select("id").eq("token_hash", token_hash).execute()
        if not res.data:
            return None
        session_id = res.data[0]["id"]
        seen = datetime.now(UTC).isoformat()
        client.table("sessions").update({"last_seen_at": seen}).eq("id", session_id).execute()
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
