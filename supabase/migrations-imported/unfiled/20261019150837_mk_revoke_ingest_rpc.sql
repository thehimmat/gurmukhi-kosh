-- Filed from the server ledger (supabase_migrations.schema_migrations 20261019150837,
-- mk_revoke_ingest_rpc), verbatim. Applied 2026-10-19 with no repo file (#253).
revoke execute on function public.mk_ingest(text,text,jsonb) from anon, authenticated, public;
