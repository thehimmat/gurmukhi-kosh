-- Add phonetic IPA column to words table for voice search
-- Run against project brczghxvpfikezsevbkh (same as gurmukhi-kosh)

alter table words add column if not exists phonetic_ipa text;

-- Trigram index for similarity search
create index if not exists words_phonetic_ipa_trgm
  on words using gin (phonetic_ipa gin_trgm_ops);

-- Phonetic search function: returns words ordered by IPA similarity
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
    similarity(w.phonetic_ipa, query_ipa) as similarity
  from words w
  where
    w.phonetic_ipa is not null
    and w.phonetic_ipa % query_ipa
  order by similarity(w.phonetic_ipa, query_ipa) desc, w.frequency desc
  limit result_limit;
$$;

grant execute on function search_words_phonetic(text, int) to anon;
