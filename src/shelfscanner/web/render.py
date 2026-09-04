"""The one way a route renders a template (017, from the review): the app's Jinja environment, by name."""

from __future__ import annotations

from fastapi import Request


def render(request: Request, name: str, **context) -> str:
    return request.app.state.templates.get_template(name).render(**context)
