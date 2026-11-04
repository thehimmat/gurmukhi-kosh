-- Filed from the server ledger (supabase_migrations.schema_migrations 20261019150740,
-- mk_pa_entries_and_ingest_rpc). Applied 2026-10-19 with no repo file (#253). Verbatim except one
-- value: the ingest token's sha256 inserted into mk_secrets is replaced with a placeholder, since
-- this repo is public. mk_ingest was revoked from every API role 57 s later (next file).
create extension if not exists pgcrypto with schema extensions;
create table public.mk_pa_entries (
  seq int primary key,                  -- source order across the whole Kosh
  head text not null,
  page int,
  text text,
  decoder_version text
);
create index on public.mk_pa_entries (head);
alter table public.mk_pa_entries enable row level security;

create table public.mk_secrets (name text primary key, sha256 text not null);
alter table public.mk_secrets enable row level security;
insert into public.mk_secrets values ('ingest','<redacted: sha256 of the ingest token>');

-- Token-gated bulk ingest into mk_* tables only. Callable with anon key + token.
create or replace function public.mk_ingest(token text, tbl text, rows jsonb)
returns int language plpgsql security definer set search_path = public, extensions as $$
declare n int;
begin
  if encode(digest(token,'sha256'),'hex') <> (select sha256 from mk_secrets where name='ingest') then
    raise exception 'bad token';
  end if;
  if tbl='mk_pa_entries' then
    insert into mk_pa_entries select * from jsonb_populate_recordset(null::mk_pa_entries, rows)
      on conflict (seq) do update set head=excluded.head,page=excluded.page,text=excluded.text,decoder_version=excluded.decoder_version;
  elsif tbl='mk_runs' then
    insert into mk_runs (section,en_volume,stats,notes,finished_at)
      select section,en_volume,stats,notes,finished_at from jsonb_populate_recordset(null::mk_runs, rows);
  elsif tbl='mk_alignments' then
    insert into mk_alignments (run_id,section,seq,pa_head,pa_page,pa_text,en_translit,en_volume,en_page,en_text,align_score,mech_issues,llm_reviewed,word_id)
      select run_id,section,seq,pa_head,pa_page,pa_text,en_translit,en_volume,en_page,en_text,align_score,mech_issues,llm_reviewed,word_id
      from jsonb_populate_recordset(null::mk_alignments, rows)
      on conflict (section,seq,en_volume) do update set en_text=excluded.en_text,mech_issues=excluded.mech_issues,llm_reviewed=excluded.llm_reviewed or mk_alignments.llm_reviewed;
  elsif tbl='mk_discrepancies' then
    insert into mk_discrepancies (alignment_id,kind,severity,pa_excerpt,en_excerpt,explanation,suggested_en)
      select alignment_id,kind,severity,pa_excerpt,en_excerpt,explanation,suggested_en from jsonb_populate_recordset(null::mk_discrepancies, rows);
  elsif tbl='mk_alignments_reviewed' then
    update mk_alignments set llm_reviewed=true where id in (select (value)::bigint from jsonb_array_elements_text(rows));
  else raise exception 'table not allowed';
  end if;
  get diagnostics n = row_count; return n;
end $$;
revoke all on function public.mk_ingest(text,text,jsonb) from public;
grant execute on function public.mk_ingest(text,text,jsonb) to anon, authenticated;
