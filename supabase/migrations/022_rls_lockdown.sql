-- 022_rls_lockdown.sql
-- Fixes Supabase security advisor findings (advisor email of 2026-07-26).
--
-- 1. rls_disabled_in_public (ERROR): migration 018 created citation_sigla,
--    dict_mappings, and dict_examples without the RLS + public-read-policy
--    boilerplate every other table migration has. All three are public
--    read-only dictionary data; the pipeline writes via the service role,
--    which bypasses RLS.
--
-- 2. bulk_update_phonetic_ipa is SECURITY DEFINER and was executable by
--    anon/authenticated via PostgREST RPC — anyone could overwrite
--    words.phonetic_ipa. It is a pipeline-only helper; restrict to
--    service_role.
--
-- 3. flag_heatmap is only called through supabaseAdmin() (admin/flags page),
--    so anon/authenticated execute is unnecessary. health_stats deliberately
--    keeps anon execute: /health reads it with the anon client.

alter table citation_sigla enable row level security;
alter table dict_mappings  enable row level security;
alter table dict_examples  enable row level security;

create policy "public read citation_sigla" on citation_sigla for select using (true);
create policy "public read dict_mappings"  on dict_mappings  for select using (true);
create policy "public read dict_examples"  on dict_examples  for select using (true);

revoke execute on function bulk_update_phonetic_ipa(jsonb) from public, anon, authenticated;
grant execute on function bulk_update_phonetic_ipa(jsonb) to service_role;

revoke execute on function flag_heatmap() from public, anon, authenticated;
grant execute on function flag_heatmap() to service_role;
