-- 065: sources describe themselves (#243, part of #239).
--
-- 1. sources gets slug (stable public name, for URLs and code), kind, tier, rank (reading order),
--    page_unit (what `ang` counts in that source), searched_by_default, author, and external_refs
--    (BaniDB SourceID, ShabadOS source code). external_refs is for cross-checking only: BaniDB and
--    ShabadOS are references we verify against, not the basis of our ids.
--
-- 2. lines.corpus_rank stops being a generated CASE on source_fk ids (031, 038, 046, 063 each
--    rewrote it). It becomes a plain column set from sources.rank by trigger: a generated column
--    can't read another table, and the search functions and indexes (031, 045, 054) keep reading
--    the column unchanged. DROP EXPRESSION keeps the stored values and rewrites nothing, so no
--    vacuum is needed (unlike SET EXPRESSION, APPLIED.md 063). A new source is now one insert, with
--    its rank; an unranked one reads last (100), as before.
--
-- 3. shabads.source_fk (006) referenced dict_sources, not sources, and every row held the default 1.
--    It now references sources, backfilled from the shabad's lines, with no default: shabads rows
--    are written without it today (060-064), so a new one reads null until its ingest sets it.

-- ─── 1. sources ──────────────────────────────────────────────────────────────

alter table sources
  add column if not exists slug                text,
  add column if not exists kind                text,
  add column if not exists tier                text,
  add column if not exists rank                int not null default 100,
  add column if not exists page_unit           text not null default 'Ang',
  add column if not exists searched_by_default boolean not null default false,
  add column if not exists author              text,
  add column if not exists external_refs       jsonb not null default '{}'::jsonb;

update sources s set
  slug = v.slug, kind = v.kind, tier = v.tier, rank = v.rank, page_unit = v.page_unit,
  searched_by_default = v.searched_by_default, author = v.author, external_refs = v.external_refs
from (values
  ('sggs_banidb_v2',        'sggs',               'scripture', 'gurbani',    0,  'Ang',    true,  null,
     '{"banidb": "G", "shabados": "SGGS"}'::jsonb),
  ('dasam_banidb_v2',       'dasam',              'scripture', 'gurbani',    10, 'Ang',    true,  null,
     '{"banidb": "D", "shabados": "SDGR"}'::jsonb),
  ('sarbloh_budha_dal',     'sarbloh',            'scripture', 'gurbani',    20, 'Ang',    false, null,
     '{"shabados": "SRBL"}'::jsonb),
  ('bhai_gurdas_banidb_v2', 'bhai-gurdas-vaaran', 'poetry',    'historical', 30, 'Vaar',   false, 'Bhai Gurdas Ji',
     '{"banidb": "B", "shabados": "VBGJ"}'::jsonb),
  ('nand_lal_ghazals',      'nand-lal-ghazals',   'poetry',    'historical', 40, 'Ghazal', false, 'Bhai Nand Lal Ji',
     '{"banidb": "N", "shabados": "GZNL"}'::jsonb)
) v(code, slug, kind, tier, rank, page_unit, searched_by_default, author, external_refs)
where s.code = v.code;

alter table sources
  alter column slug set not null,
  alter column kind set not null,
  alter column tier set not null,
  add constraint sources_slug_key unique (slug),
  add constraint sources_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  add constraint sources_kind_check check (kind in ('scripture', 'poetry', 'transcreation', 'commentary', 'dictionary')),
  add constraint sources_tier_check check (tier in ('gurbani', 'historical', 'reference'));

-- ─── 2. lines.corpus_rank from sources.rank ──────────────────────────────────

alter table lines alter column corpus_rank drop expression;

create or replace function lines_set_corpus_rank()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.corpus_rank := coalesce((select rank from sources where id = new.source_fk), 100);
  return new;
end;
$$;

-- Also on a direct write to corpus_rank, so the column can only ever hold its source's rank.
create trigger lines_corpus_rank
  before insert or update of source_fk, corpus_rank on lines
  for each row execute function lines_set_corpus_rank();

create or replace function sources_propagate_rank()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update lines set corpus_rank = new.rank where source_fk = new.id;
  return null;
end;
$$;

create trigger sources_rank
  after update of rank on sources
  for each row when (old.rank is distinct from new.rank)
  execute function sources_propagate_rank();

revoke execute on function lines_set_corpus_rank() from public, anon, authenticated;
revoke execute on function sources_propagate_rank() from public, anon, authenticated;

-- ─── 3. shabads.source_fk → sources ──────────────────────────────────────────

alter table shabads drop constraint if exists shabads_source_fk_fkey;
alter table shabads alter column source_fk drop default;

update shabads sh set source_fk = l.source_fk
from (select shabad_id, min(source_fk) as source_fk from lines where shabad_id is not null group by shabad_id) l
where l.shabad_id = sh.id and sh.source_fk is distinct from l.source_fk;

alter table shabads add constraint shabads_source_fk_fkey foreign key (source_fk) references sources(id);
