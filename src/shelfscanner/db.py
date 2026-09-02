"""Supabase client using the service key (proposal D12: RLS on, no policies)."""

from __future__ import annotations

from functools import lru_cache

from supabase import Client, create_client

from shelfscanner.settings import load_settings


@lru_cache(maxsize=1)
def get_client() -> Client:
    s = load_settings()
    return create_client(s.supabase_url, s.supabase_secret_key)
