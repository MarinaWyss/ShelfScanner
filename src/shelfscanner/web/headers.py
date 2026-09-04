"""Response headers (017 D6): one plain ASGI middleware, outermost, so every response has them, the
event stream and the 404s included.

The Content-Security-Policy allows the app's own scripts plus the one inline
script in `base.html` (the theme, before first paint) by a per-request nonce;
inline styles stay allowed because the templates, `app.js` and htmx all set
`style=`; fonts come from Google Fonts, covers from Open Library, the photo
preview is a `blob:` URL. Nothing may frame the app. The nonce lives in a
context variable for the request, which is how the template reaches it: the
routes render with `get_template(...).render(...)` and no request object.
"""

from __future__ import annotations

import secrets
from contextvars import ContextVar

from starlette.datastructures import MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

HEADERS = {
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
    "x-frame-options": "DENY",
}
CSP = ("default-src 'self'; script-src 'self' 'nonce-{nonce}'; "
       "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; "
       "img-src 'self' data: blob: https://covers.openlibrary.org; connect-src 'self'; "
       "frame-ancestors 'none'; base-uri 'self'; form-action 'self'")

_nonce: ContextVar[str] = ContextVar("csp_nonce", default="")


def new_nonce() -> str:
    return secrets.token_urlsafe(16)


def csp_nonce() -> str:
    """The current request's nonce, for the template; empty outside a request."""
    return _nonce.get()


def csp(nonce: str) -> str:
    return CSP.format(nonce=nonce)


class HeadersMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        nonce = new_nonce()
        token = _nonce.set(nonce)

        async def send_with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                for name, value in HEADERS.items():
                    headers[name] = value
                headers["content-security-policy"] = csp(nonce)
            await send(message)

        try:
            await self.app(scope, receive, send_with_headers)
        finally:
            _nonce.reset(token)
