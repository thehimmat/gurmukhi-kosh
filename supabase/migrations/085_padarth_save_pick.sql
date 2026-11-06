-- 085: save a pad-arth pick in one transaction (#23).
--
-- The builder calls this for every change to a word's or phrase's pick. The caller names the
-- chosen rows only, as a JSON array of {"kind": "padarth_gloss" | "definition", "id": n}, in the
-- order they should be kept. The function reads each row and writes the ref's snapshot and stable
-- key (084) itself, so a ref always records what its row said when it was picked, whatever the
-- page sent. A pad-arth gloss must be on the pick's own line.
--
-- Saving replaces the pick's refs, override and note. Blank text counts as none. With nothing
-- chosen, no override and no note, the pick is removed and the function returns null.

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
    else
      raise exception 'padarth_save_pick: unknown ref kind %', coalesce(v_kind, 'null');
    end if;
    v_ordinal := v_ordinal + 1;
  end loop;

  return v_pick;
end $$;

revoke execute on function padarth_save_pick(bigint, int[], text, text, text, jsonb, text) from public, anon, authenticated;
grant execute on function padarth_save_pick(bigint, int[], text, text, text, jsonb, text) to service_role;
