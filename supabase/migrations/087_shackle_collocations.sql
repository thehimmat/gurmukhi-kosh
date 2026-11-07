-- 087: Shackle's phrases (#163, #377), and picking one in the pad-arth builder (#23).
--
-- dict_collocations holds the multi-word expressions a dictionary defines with a gloss of its own:
-- for Shackle, his compounds ("ammrita velā") and the glossed phrases in his usage notes ("ita uta
-- 'everywhere'"), parsed by pipeline/shackle/collocations.ts. members holds, per word, every
-- Gurmukhi spelling the romanisation allows, so the builder matches a phrase against a line's
-- consecutive words without guessing. Curator-only like Shackle's definitions (069): RLS on, no
-- policies, no API-role grants.
--
-- A pick can now name a collocation (ref_kind 'collocation'). Its stable key is the source and the
-- romanised phrase; padarth_save_pick() and padarth_relink_refs() learn the new kind. Ingests delete
-- and re-create collocations, so a ref's id goes null and the relink reattaches it, as for 084.

create table if not exists dict_collocations (
  id              bigserial primary key,
  dict_source_id  bigint not null references dict_sources(id),
  source_entry    text not null,
  head_word_id    bigint references words(id) on delete set null,
  phrase_roman    text not null check (btrim(phrase_roman) <> ''),
  phrase_gurmukhi text not null check (btrim(phrase_gurmukhi) <> ''),
  members         jsonb not null check (jsonb_typeof(members) = 'array' and jsonb_array_length(members) >= 2),
  gloss           text not null check (btrim(gloss) <> ''),
  pos_raw         text,
  origin          text not null check (origin in ('compound', 'usage')),
  provenance      text not null default 'imported'
                  check (provenance in ('scraped','imported','rule_derived','computed','ai_draft','human_verified')),
  review_status   text not null default 'unreviewed'
                  check (review_status in ('unreviewed','approved','needs_work','rejected')),
  created_at      timestamptz not null default now(),
  unique (dict_source_id, source_entry, phrase_roman)
);
comment on table dict_collocations is 'Multi-word expressions a dictionary glosses (#163), with candidate Gurmukhi spellings per word.';
create index if not exists dict_collocations_source on dict_collocations (dict_source_id);

alter table dict_collocations enable row level security;
revoke all on dict_collocations from anon, authenticated;
revoke all on sequence dict_collocations_id_seq from anon, authenticated;

-- Picks can name a collocation.
alter table padarth_pick_refs add column if not exists collocation_id bigint references dict_collocations(id) on delete set null;
alter table padarth_pick_refs add column if not exists key_phrase_roman text;
alter table padarth_pick_refs drop constraint if exists padarth_pick_refs_ref_kind_check;
alter table padarth_pick_refs add constraint padarth_pick_refs_ref_kind_check
  check (ref_kind in ('padarth_gloss', 'definition', 'collocation'));
alter table padarth_pick_refs drop constraint if exists padarth_pick_refs_collocation_check;
alter table padarth_pick_refs add constraint padarth_pick_refs_collocation_check
  check (ref_kind <> 'collocation'
         or (padarth_gloss_id is null and definition_id is null and key_phrase_roman is not null));
create index if not exists padarth_pick_refs_collocation on padarth_pick_refs (collocation_id) where collocation_id is not null;

create or replace function padarth_save_pick(
  p_line_id   bigint,
  p_positions int[],
  p_surface   text,
  p_override  text,
  p_note      text,
  p_refs      jsonb,
  p_chosen_by text
) returns bigint
language plpgsql as $$
declare
  v_override text := nullif(btrim(coalesce(p_override, '')), '');
  v_note     text := nullif(btrim(coalesce(p_note, '')), '');
  v_pick     bigint;
  v_ref      jsonb;
  v_ordinal  int := 0;
  v_kind     text;
  v_id       bigint;
  g          padarth_glosses%rowtype;
  d          record;
  c          record;
begin
  if jsonb_typeof(coalesce(p_refs, '[]'::jsonb)) <> 'array' then
    raise exception 'padarth_save_pick: refs must be a JSON array';
  end if;

  if jsonb_array_length(coalesce(p_refs, '[]'::jsonb)) = 0 and v_override is null and v_note is null then
    delete from padarth_picks where line_id = p_line_id and positions = p_positions;
    return null;
  end if;

  insert into padarth_picks (line_id, positions, surface_text, override_text, note_text, chosen_by)
  values (p_line_id, p_positions, p_surface, v_override, v_note, p_chosen_by)
  on conflict (line_id, positions) do update
     set surface_text = excluded.surface_text,
         override_text = excluded.override_text,
         note_text = excluded.note_text,
         chosen_by = excluded.chosen_by
  returning id into v_pick;

  delete from padarth_pick_refs where pick_id = v_pick;

  for v_ref in select * from jsonb_array_elements(coalesce(p_refs, '[]'::jsonb)) loop
    v_kind := v_ref->>'kind';
    v_id := (v_ref->>'id')::bigint;
    if v_kind = 'padarth_gloss' then
      select * into g from padarth_glosses where id = v_id;
      if not found then
        raise exception 'padarth_save_pick: no pad-arth gloss %', v_id;
      end if;
      if g.line_id <> p_line_id then
        raise exception 'padarth_save_pick: pad-arth gloss % is not on line %', v_id, p_line_id;
      end if;
      insert into padarth_pick_refs (pick_id, ordinal, ref_kind, source_code, padarth_gloss_id,
                                     key_line_id, key_ordinal, snapshot_term, snapshot_text)
      values (v_pick, v_ordinal, 'padarth_gloss', g.source_code, g.id, g.line_id, g.ordinal, g.term, g.gloss);
    elsif v_kind = 'definition' then
      select df.id, df.word_id, df.sense_number, df.definition_text, s.code, w.gurmukhi
        into d
        from definitions df
        join dict_sources s on s.id = df.dict_source_id
        join words w on w.id = df.word_id
       where df.id = v_id;
      if not found then
        raise exception 'padarth_save_pick: no definition %', v_id;
      end if;
      insert into padarth_pick_refs (pick_id, ordinal, ref_kind, source_code, definition_id,
                                     key_word_id, key_sense_number, snapshot_term, snapshot_text)
      values (v_pick, v_ordinal, 'definition', d.code, d.id, d.word_id, d.sense_number, d.gurmukhi, d.definition_text);
    elsif v_kind = 'collocation' then
      select co.id, co.phrase_roman, co.phrase_gurmukhi, co.gloss, s.code
        into c
        from dict_collocations co
        join dict_sources s on s.id = co.dict_source_id
       where co.id = v_id;
      if not found then
        raise exception 'padarth_save_pick: no collocation %', v_id;
      end if;
      insert into padarth_pick_refs (pick_id, ordinal, ref_kind, source_code, collocation_id,
                                     key_phrase_roman, snapshot_term, snapshot_text)
      values (v_pick, v_ordinal, 'collocation', c.code, c.id, c.phrase_roman, c.phrase_gurmukhi, c.gloss);
    else
      raise exception 'padarth_save_pick: unknown ref kind %', coalesce(v_kind, 'null');
    end if;
    v_ordinal := v_ordinal + 1;
  end loop;

  return v_pick;
end $$;

revoke execute on function padarth_save_pick(bigint, int[], text, text, text, jsonb, text) from public, anon, authenticated;
grant execute on function padarth_save_pick(bigint, int[], text, text, text, jsonb, text) to service_role;

create or replace function padarth_relink_refs() returns table (relinked int, unlinked int)
language plpgsql as $$
declare
  n_gloss int;
  n_def   int;
  n_col   int;
begin
  with cand as (
    select r.id as ref_id, g.id as row_id,
           g.ordinal = r.key_ordinal as same,
           count(*) over (partition by r.id) as n,
           count(*) filter (where g.ordinal = r.key_ordinal) over (partition by r.id) as n_same
      from padarth_pick_refs r
      join padarth_glosses g
        on g.line_id = r.key_line_id
       and g.source_code = r.source_code
       and g.kind = 'entry'
       and g.term is not distinct from r.snapshot_term
       and g.gloss = r.snapshot_text
     where r.ref_kind = 'padarth_gloss' and r.padarth_gloss_id is null
  )
  update padarth_pick_refs r set padarth_gloss_id = c.row_id
    from cand c
   where r.id = c.ref_id and (c.n = 1 or (c.n_same = 1 and c.same));
  get diagnostics n_gloss = row_count;

  with cand as (
    select r.id as ref_id, d.id as row_id,
           d.sense_number is not distinct from r.key_sense_number as same,
           count(*) over (partition by r.id) as n,
           count(*) filter (where d.sense_number is not distinct from r.key_sense_number)
             over (partition by r.id) as n_same
      from padarth_pick_refs r
      join dict_sources s on s.code = r.source_code
      join definitions d
        on d.word_id = r.key_word_id
       and d.dict_source_id = s.id
       and d.definition_text = r.snapshot_text
     where r.ref_kind = 'definition' and r.definition_id is null
  )
  update padarth_pick_refs r set definition_id = c.row_id
    from cand c
   where r.id = c.ref_id and (c.n = 1 or (c.n_same = 1 and c.same));
  get diagnostics n_def = row_count;

  -- Shackle phrases (087): the same source and romanised phrase, with the same gloss.
  with cand as (
    select r.id as ref_id, c.id as row_id, count(*) over (partition by r.id) as n
      from padarth_pick_refs r
      join dict_sources s on s.code = r.source_code
      join dict_collocations c
        on c.dict_source_id = s.id
       and c.phrase_roman = r.key_phrase_roman
       and c.gloss = r.snapshot_text
     where r.ref_kind = 'collocation' and r.collocation_id is null
  )
  update padarth_pick_refs r set collocation_id = c.row_id
    from cand c
   where r.id = c.ref_id and c.n = 1;
  get diagnostics n_col = row_count;

  relinked := n_gloss + n_def + n_col;
  select count(*)::int into unlinked
    from padarth_pick_refs
   where (ref_kind = 'padarth_gloss' and padarth_gloss_id is null)
      or (ref_kind = 'definition' and definition_id is null)
      or (ref_kind = 'collocation' and collocation_id is null);
  return next;
end $$;

revoke execute on function padarth_relink_refs() from public, anon, authenticated;
grant execute on function padarth_relink_refs() to service_role;
