-- Change 008: the one advisor warning the project carried (0028/0029). `public.rls_auto_enable()`
-- is a SECURITY DEFINER helper that predates change 001 and is not called by any client; it was
-- executable through /rest/v1/rpc by anon and authenticated. Nothing here needs that.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
