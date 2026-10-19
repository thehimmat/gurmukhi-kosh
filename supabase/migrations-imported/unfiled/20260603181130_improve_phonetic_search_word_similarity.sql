-- UNFILED: copied verbatim from the server ledger (supabase_migrations.schema_migrations,
-- version 20260603181130, name improve_phonetic_search_word_similarity) on 2026-10-19. It ran only in the database; see supabase/APPLIED.md.

-- Lower the similarity threshold and use word_similarity so shorter queries
-- match longer stored keys (e.g. "satnam" finds "satinamu")
set pg_trgm.similarity_threshold = 0.25;

create or replace function search_words_phonetic(query_ipa text, result_limit int default 20)
returns table (
  id bigint,
  gurmukhi text,
  phonetic_ipa text,
  frequency int,
  similarity float
)
language sql stable as $$
  select
    w.id,
    w.gurmukhi,
    w.phonetic_ipa,
    w.frequency,
    greatest(
      similarity(w.phonetic_ipa, query_ipa),
      word_similarity(query_ipa, w.phonetic_ipa)
    ) as similarity
  from words w
  where
    w.phonetic_ipa is not null
    and (
      w.phonetic_ipa % query_ipa
      or query_ipa <% w.phonetic_ipa
    )
  order by greatest(
    similarity(w.phonetic_ipa, query_ipa),
    word_similarity(query_ipa, w.phonetic_ipa)
  ) desc, w.frequency desc
  limit result_limit;
$$;

grant execute on function search_words_phonetic(text, int) to anon;
