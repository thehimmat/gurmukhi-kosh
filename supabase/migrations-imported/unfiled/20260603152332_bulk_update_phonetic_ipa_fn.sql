-- UNFILED: copied verbatim from the server ledger (supabase_migrations.schema_migrations,
-- version 20260603152332, name bulk_update_phonetic_ipa_fn) on 2026-10-19. It ran only in the database; see supabase/APPLIED.md.

create or replace function bulk_update_phonetic_ipa(updates jsonb)
returns void language plpgsql security definer as $$
begin
  update words w
  set phonetic_ipa = u.phonetic_ipa
  from jsonb_to_recordset(updates) as u(id bigint, phonetic_ipa text)
  where w.id = u.id;
end;
$$;

grant execute on function bulk_update_phonetic_ipa(jsonb) to anon;
