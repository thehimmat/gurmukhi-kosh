-- 060: shabad_id for Sri Sarbloh Granth lines (#233).
--
-- Every other corpus has a shabad_id per line; the Sarbloh lines (sarbloh_budha_dal, 038/039) had
-- none, so a reader (the Santhya Transcriber, the line viewer) saw a whole class as one section.
-- Each Sarbloh shabad is one run of one chhand, or one titled section, as Dasam Bani has them from
-- BaniDB, found from the header lines (pipeline/sarbloh/lines.ts sectionIndexes, which this
-- function mirrors; keep the word lists the same, tests/sarbloh-sections.test.ts checks).
--
-- Id range: 900001 upward, in reading order. The shabads table already holds SGGS (1-5540), Dasam
-- Bani (7402+), Bhai Gurdas (40001+) and a few BaniDB ids up to 555569, so 900001+ cannot collide.
-- One shabads row per section (ang_start = its first line's ang; no raag or writer).
-- Only lines.shabad_id is set: id, verse_id, line_no and ang stay as loaded.

create or replace function public.sarbloh_section_indexes(texts text[])
returns int[]
language plpgsql
immutable
set search_path = ''
as $$
declare
  chhands constant jsonb := '{
    "ਚੌਪਈ": "ਚੌਪਈ", "ਚੁਪਈ": "ਚੌਪਈ", "ਚਉਪਈ": "ਚੌਪਈ", "ਚਰਪਈ": "ਚੌਪਈ", "ਚੌਪਾਈ": "ਚੌਪਈ",
    "ਦੋਹਰਾ": "ਦੋਹਰਾ", "ਦੋਹਿਰਾ": "ਦੋਹਰਾ", "ਦੋਹਾ": "ਦੋਹਰਾ",
    "ਸੋਰਠਾ": "ਸੋਰਠਾ",
    "ਛਪਯ": "ਛਪਯ", "ਛਪੈ": "ਛਪਯ",
    "ਕਬਿੱਤ": "ਕਬਿੱਤ", "ਕਬਿਤ": "ਕਬਿੱਤ", "ਕਵਿਤ": "ਕਬਿੱਤ", "ਕਬਿਤੁ": "ਕਬਿੱਤ",
    "ਸ੍ਵੈਯਾ": "ਸ੍ਵੈਯਾ", "ਸਵੈਯਾ": "ਸ੍ਵੈਯਾ", "ਸਵੱਯਾ": "ਸ੍ਵੈਯਾ",
    "ਨਰਾਜ": "ਨਰਾਜ", "ਨਰਾਚ": "ਨਰਾਜ",
    "ਭੁਜੰਗ": "ਭੁਜੰਗ",
    "ਅੜਿਲ": "ਅੜਿਲ", "ਅੜਿੱਲ": "ਅੜਿਲ",
    "ਤ੍ਰਿਭੰਗੀ": "ਤ੍ਰਿਭੰਗੀ", "ਤਿਭੰਗੀ": "ਤ੍ਰਿਭੰਗੀ",
    "ਰਸਾਵਲ": "ਰਸਾਵਲ", "ਤੋਮਰ": "ਤੋਮਰ", "ਪਾਧੜੀ": "ਪਾਧੜੀ", "ਝੂਲਨਾ": "ਝੂਲਨਾ", "ਰੇਖਤਾ": "ਰੇਖਤਾ",
    "ਸਲੋਕ": "ਸਲੋਕ", "ਪਉੜੀ": "ਪਉੜੀ", "ਕਲਸ": "ਕਲਸ",
    "ਚਰਪਦ": "ਚਰਪਦ", "ਚਰਪਦਾ": "ਚਰਪਦ", "ਚਤੁਰਪਦ": "ਚਰਪਦ", "ਚਉਪਦਾ": "ਚਰਪਦ",
    "ਛੰਦ": "", "ਛੰਤ": ""
  }';
  chhand_lines constant jsonb := '{"ਪਈ": "ਚੌਪਈ"}';
  label_lines constant text[] := array['ਸਾਨੀ', 'ਮਲਾਰ', 'ਮਲ੍ਹਾਰ', 'ਸਮ'];
  trailer_lines constant text[] := array['ਰਹਾਉ'];
  label_endings constant text[] := array['ਬਾਚ', 'ਵਾਚ', 'ਸਹਾਇ', 'ਫਤਿਹ', 'ਫ਼ਤਿਹ'];
  colophon_words constant text[] := array['ਇਤਿ', 'ਇਤੀ', 'ਇਤ'];
  header_words constant int := 6;
  label_numbered_words constant int := 2;

  n int := coalesce(array_length(texts, 1), 0);
  starts boolean[] := array_fill(false, array[greatest(n, 1)]);
  out int[] := array_fill(0, array[greatest(n, 1)]);
  g text; words text[]; txt text; w text; num text;
  kind text; chhand text;
  run text := null;
  versed boolean := false;
  between boolean := true;
  block_start int := 1;
  block_split boolean := false;
  section int := -1;
begin
  if n = 0 then return '{}'; end if;
  starts[1] := true;
  for i in 1..n loop
    g := texts[i];
    txt := trim(regexp_replace(regexp_replace(g, '[।॥੦-੯]+', ' ', 'g'), '\s+', ' ', 'g'));
    words := case when txt = '' then '{}'::text[] else string_to_array(txt, ' ') end;
    num := substring(g from '॥([੦-੯]+)(?:॥[੦-੯]+)*॥$');

    -- classify (lines.ts classify)
    chhand := null;
    if words[1] = any(colophon_words) then kind := 'colophon';
    elsif num is not null then kind := 'numbered';
    elsif 'ਅਥ' = any(words) or words[1] like 'ਬਿਸਨ%' then kind := 'title';
    elsif txt = any(trailer_lines) then kind := 'trailer';
    elsif chhand_lines ? txt then kind := 'header'; chhand := chhand_lines ->> txt;
    else
      kind := 'verse';
      if coalesce(array_length(words, 1), 0) <= header_words then
        foreach w in array coalesce(words, '{}') loop
          if coalesce(chhands ->> w, '') <> '' then chhand := chhands ->> w; exit; end if;
        end loop;
        if chhand is null and exists (select 1 from unnest(words) x where chhands ? x) then chhand := txt; end if;
        if chhand is not null then kind := 'header'; end if;
      end if;
      if kind = 'verse' and (txt = any(label_lines) or 'ੴ' = any(words)
          or (coalesce(array_length(words, 1), 0) <= header_words
              and exists (select 1 from unnest(words) x, unnest(label_endings) e where right(x, char_length(e)) = e))) then
        kind := 'label';
      end if;
    end if;
    if kind = 'title' then
      foreach w in array words loop
        if coalesce(chhands ->> w, '') <> '' then chhand := chhands ->> w; exit; end if;
      end loop;
      if chhand is null and exists (select 1 from unnest(words) x where chhands ? x) then chhand := txt; end if;
      chhand := coalesce(chhand, txt);
    end if;

    -- walk (lines.ts sectionIndexes)
    if kind = 'numbered' and between and coalesce(array_length(words, 1), 0) <= label_numbered_words then
      if not block_split then block_start := i + 1; end if;
    elsif kind in ('colophon', 'numbered') then
      if kind = 'numbered' and translate(num, '੦੧੨੩੪੫੬੭੮੯', '0123456789')::bigint = 1 and versed and not block_split then
        starts[block_start] := true; versed := false; block_split := true;
      end if;
      if kind = 'numbered' then versed := true; else run := null; end if;
      between := true;
      block_start := i + 1;
      block_split := false;
    elsif not between or kind = 'verse' then
      between := false;
    elsif kind = 'trailer' then
      if not block_split then block_start := i + 1; end if;
    elsif kind in ('title', 'header') then
      if versed and not block_split and (kind = 'title' or chhand is distinct from run) then
        starts[block_start] := true; versed := false; block_split := true;
      end if;
      if not versed then run := chhand; end if;
    end if;
  end loop;

  for i in 1..n loop
    if starts[i] then section := section + 1; end if;
    out[i] := section;
  end loop;
  return out;
end $$;

do $$
declare
  sarbloh bigint := (select id from sources where code = 'sarbloh_budha_dal');
begin
  if sarbloh is null or not exists (select 1 from lines where source_fk = sarbloh and shabad_id is null) then
    return; -- not loaded, or already done
  end if;

  create temp table sarbloh_sections on commit drop as
  with ordered as (
    select array_agg(id order by line_no) ids, array_agg(gurmukhi order by line_no) texts
      from lines where source_fk = sarbloh
  )
  select u.id, 900001 + u.section as shabad_id
    from ordered, unnest(ordered.ids, public.sarbloh_section_indexes(ordered.texts)) as u(id, section);

  insert into shabads (id, ang_start)
  select s.shabad_id, min(l.ang)
    from sarbloh_sections s join lines l on l.id = s.id
   group by s.shabad_id
  on conflict (id) do nothing;

  update lines l
     set shabad_id = s.shabad_id
    from sarbloh_sections s
   where l.id = s.id and l.shabad_id is null;
end $$;
