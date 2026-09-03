"""One module per provider. Each exposes a class implementing `shelfscanner.router.ModelClient`.

The router maps `Model.adapter` to a class here (see `router.ADAPTERS`); an adapter module is
the only place its provider's SDK is imported (change 002, D2).
"""
