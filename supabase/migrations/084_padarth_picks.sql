-- 084: the pad-arth builder's saved picks (#23, folding in #158).
--
-- A pick is the curator's choice of gloss(es) for one word, or one phrase, in one line. Phrase
-- words may be apart (ਕੂੜੈ … ਪਾਲਿ), so a pick holds the word positions, not a start/end span.
-- Choosing is optional: a word with no pick still shows every gloss. A pick may override the
-- wording (override_text) and carry a note; padarth_line_notes holds one note per line.
--
-- A pick's refs are the gloss rows it was picked from: a Sahib Singh pad-arth entry
-- (padarth_glosses) or a dictionary sense (definitions). Ingests delete and re-create those rows,
-- so each ref also keeps:
--   - a snapshot of what was picked (term and text), which is what renders if the row is gone;
--   - a stable key (pad-arth: line + ordinal; definition: word + sense number).
-- Deleting a row sets the ref's id to null; padarth_relink_refs(), run after an ingest,
-- reattaches it to the row with the same key and the same text. A reworded row is not reattached:
-- the snapshot stays, unlinked, for the curator to look at.
--
-- Picks are human work, so deleting a line that has picks is refused (on delete restrict) rather
-- than cascading them away.
--
-- These are the curator's tables: RLS is on with no policy, and the API roles have no grants.
-- The admin builder writes through the service role (lib/supabase.ts supabaseAdmin).

create or replace function padarth_positions_ok(p int[]) returns boolean
language sql immutable as $$
  select cardinality(p) > 0
     and array_position(p, null) is null
     and p[1] >= 0
     and p = array(select distinct x from unnest(p) x order by x)
$$;

create table if not exists padarth_picks (
  id            bigserial primary key,
  line_id       bigint not null references lines(id) on delete restrict,
  positions     int[] not null check (padarth_positions_ok(positions)),
  surface_text  text not null check (btrim(surface_text) <> ''),
  override_text text check (btrim(override_text) <> ''),
  note_text     text check (btrim(note_text) <> ''),
  chosen_by     text not null,
  provenance    text not null default 'human_verified'
                check (provenance in ('scraped','imported','rule_derived','computed','ai_draft','human_verified')),
  review_status text not null default 'unreviewed'
                check (review_status in ('unreviewed','approved','needs_work','rejected')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (line_id, positions)
);
comment on table padarth_picks is
  'Pad-arth builder (#23): the curator''s chosen gloss(es) for one word or phrase (positions, in order) in one line.';

create table if not exists padarth_pick_refs (
  id               bigserial primary key,
  pick_id          bigint not null references padarth_picks(id) on delete cascade,
  ordinal          int not null,
  ref_kind         text not null check (ref_kind in ('padarth_gloss', 'definition')),
  source_code      text not null,
  padarth_gloss_id bigint references padarth_glosses(id) on delete set null,
  definition_id    bigint references definitions(id) on delete set null,
  -- Stable keys, for relinking after a re-ingest.
  key_line_id      bigint,
  key_ordinal      int,
  key_word_id      bigint,
  key_sense_number int,
  -- What was picked, as it read then.
  snapshot_term    text,
  snapshot_text    text not null check (btrim(snapshot_text) <> ''),
  unique (pick_id, ordinal),
  check (ref_kind <> 'padarth_gloss'
         or (definition_id is null and key_line_id is not null and key_ordinal is not null)),
  check (ref_kind <> 'definition' or (padarth_gloss_id is null and key_word_id is not null))
);
create index if not exists padarth_pick_refs_gloss on padarth_pick_refs (padarth_gloss_id) where padarth_gloss_id is not null;
create index if not exists padarth_pick_refs_definition on padarth_pick_refs (definition_id) where definition_id is not null;
comment on table padarth_pick_refs is
  'The rows a pad-arth pick was chosen from, with a snapshot and a stable key so a re-ingest cannot lose them (padarth_relink_refs).';

create table if not exists padarth_line_notes (
  line_id       bigint primary key references lines(id) on delete restrict,
  note_text     text not null check (btrim(note_text) <> ''),
  chosen_by     text not null,
  provenance    text not null default 'human_verified'
                check (provenance in ('scraped','imported','rule_derived','computed','ai_draft','human_verified')),
  review_status text not null default 'unreviewed'
                check (review_status in ('unreviewed','approved','needs_work','rejected')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
comment on table padarth_line_notes is 'Pad-arth builder (#23): the curator''s note on a whole line.';

create or replace function padarth_touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists padarth_picks_touch on padarth_picks;
create trigger padarth_picks_touch before update on padarth_picks
  for each row execute function padarth_touch_updated_at();
drop trigger if exists padarth_line_notes_touch on padarth_line_notes;
create trigger padarth_line_notes_touch before update on padarth_line_notes
  for each row execute function padarth_touch_updated_at();

-- Reattach refs whose row was deleted to the row with the same key and the same text. Where
-- several rows qualify, the one with the same ordinal (pad-arth) or sense number (definition)
-- wins; if that does not settle it, the ref stays unlinked.
create or replace function padarth_relink_refs() returns table (relinked int, unlinked int)
language plpgsql as $$
declare
  n_gloss int;
  n_def   int;
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

  relinked := n_gloss + n_def;
  select count(*)::int into unlinked
    from padarth_pick_refs
   where (ref_kind = 'padarth_gloss' and padarth_gloss_id is null)
      or (ref_kind = 'definition' and definition_id is null);
  return next;
end $$;

alter table padarth_picks      enable row level security;
alter table padarth_pick_refs  enable row level security;
alter table padarth_line_notes enable row level security;
revoke all on padarth_picks, padarth_pick_refs, padarth_line_notes from anon, authenticated;
revoke all on sequence padarth_picks_id_seq, padarth_pick_refs_id_seq from anon, authenticated;

revoke execute on function padarth_relink_refs() from public, anon, authenticated;
grant execute on function padarth_relink_refs() to service_role;
