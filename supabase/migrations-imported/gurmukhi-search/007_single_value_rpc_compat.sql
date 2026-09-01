-- 007: keep the pre-006 RPC shape callable while the new client rolls out.
--
-- Migration 006 replaced p_raag/p_writer with arrays, which changes the function
-- signature — so the moment it was applied, the already-deployed client's calls
-- ("Could not find the function public.search_lines_regex(...p_raag, p_writer)")
-- started failing. PostgREST resolves overloads by the parameter names supplied,
-- so the old single-value shapes can coexist as thin wrappers over the new ones.
--
-- Applied ahead of this branch's deploy to restore production. Remove once the
-- multi-select client is live everywhere (tracked as an issue).

create or replace function search_lines_regex(
  p_regex    text,
  p_raag     text,
  p_writer   text,
  p_ang_min  int  default null,
  p_ang_max  int  default null,
  p_limit    int  default 20,
  p_offset   int  default 0
)
returns table(
  id               bigint,
  verse_id         int,
  shabad_id        int,
  ang              int,
  line_no          int,
  gurmukhi         text,
  translation_en   text,
  transliteration_en text,
  raag_english     text,
  raag_gurmukhi    text,
  writer_english   text,
  writer_id        int,
  ang_start        int,
  total_count      bigint
)
language sql stable
as $$
  select
    r.id, r.verse_id, r.shabad_id, r.ang, r.line_no,
    r.gurmukhi, r.translation_en, r.transliteration_en,
    r.raag_english, r.raag_gurmukhi, r.writer_english, r.writer_id, r.ang_start,
    r.total_count
  from search_lines_regex(
    p_regex,
    case when p_raag   is null then null else array[p_raag]   end,
    case when p_writer is null then null else array[p_writer] end,
    null::bigint[],
    p_ang_min, p_ang_max, p_limit, p_offset
  ) r;
$$;

create or replace function search_first_letters(
  p_letters  text[],
  p_raag     text,
  p_writer   text,
  p_ang_min  int  default null,
  p_ang_max  int  default null,
  p_limit    int  default 20,
  p_offset   int  default 0
)
returns table(
  id               bigint,
  verse_id         int,
  shabad_id        int,
  ang              int,
  line_no          int,
  gurmukhi         text,
  translation_en   text,
  transliteration_en text,
  raag_english     text,
  raag_gurmukhi    text,
  writer_english   text,
  writer_id        int,
  ang_start        int,
  total_count      bigint
)
language sql stable
as $$
  select
    r.id, r.verse_id, r.shabad_id, r.ang, r.line_no,
    r.gurmukhi, r.translation_en, r.transliteration_en,
    r.raag_english, r.raag_gurmukhi, r.writer_english, r.writer_id, r.ang_start,
    r.total_count
  from search_first_letters(
    p_letters,
    case when p_raag   is null then null else array[p_raag]   end,
    case when p_writer is null then null else array[p_writer] end,
    null::bigint[],
    p_ang_min, p_ang_max, p_limit, p_offset
  ) r;
$$;

create or replace function search_lines_by_word_ids(
  p_word_ids bigint[],
  p_raag     text,
  p_writer   text,
  p_ang_min  int  default null,
  p_ang_max  int  default null,
  p_limit    int  default 20,
  p_offset   int  default 0
)
returns table(
  id               bigint,
  verse_id         int,
  shabad_id        int,
  ang              int,
  line_no          int,
  gurmukhi         text,
  translation_en   text,
  transliteration_en text,
  raag_english     text,
  raag_gurmukhi    text,
  writer_english   text,
  writer_id        int,
  ang_start        int
)
language sql stable
as $$
  select
    r.id, r.verse_id, r.shabad_id, r.ang, r.line_no,
    r.gurmukhi, r.translation_en, r.transliteration_en,
    r.raag_english, r.raag_gurmukhi, r.writer_english, r.writer_id, r.ang_start
  from search_lines_by_word_ids(
    p_word_ids,
    case when p_raag   is null then null else array[p_raag]   end,
    case when p_writer is null then null else array[p_writer] end,
    null::bigint[],
    p_ang_min, p_ang_max, p_limit, p_offset
  ) r;
$$;

grant execute on function search_lines_regex(text, text, text, int, int, int, int) to anon;
grant execute on function search_first_letters(text[], text, text, int, int, int, int) to anon;
grant execute on function search_lines_by_word_ids(bigint[], text, text, int, int, int, int) to anon;
