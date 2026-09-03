"""The web app (change 003): a phone-first page that turns a shelf photo into titles.

`shelfscanner.web.app:app` is the ASGI application. `create_app()` takes the
session store and the pipeline boundary as arguments so tests and a fake-mode
server never touch Supabase or a model provider.
"""
