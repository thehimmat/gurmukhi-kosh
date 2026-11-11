-- 092: looser automatic links from dictionary entries to Kosh words (#249).
--
-- The links are curator-only research aids (unreviewed links never reach the public, 089), and
-- nobody is going to review hundreds of thousands of them, so recall matters more than precision.
-- Two tiers go below exact (1.0) and fold (0.5):
--
--   loose (0.3)  dict_loose_key: the search fold (lib/gurmukhi-fold.ts), then also ignore halant,
--                ਵ/ਬ, ਯ/ਜ, ਞ/ਨ, read kṣ (ਕਸ) as ਖ and jñā (ਜਞਾ) as ਗਿਆ, and drop a final vowel
--                sign: the usual gaps between a Sanskrit spelling and Gurbani's (ਪ੍ਰਸਾਦ ~ ਪਰਸਾਦਿ,
--                ਜਞਾਨ ~ ਗਿਆਨੁ, ਵੇਦ ~ ਬੇਦ, ਰਾਜ ~ ਰਾਜਾ).
--   stem (0.2)   dict_stem_key, Sanskrit sources only, and only for an entry nothing else links:
--                a consonant stem in -n or -s (its Devanagari headword ends in न् or स्; the
--                Gurmukhi spelling can't show the virama) without that consonant (नामन् ~ ਨਾਮੁ,
--                राजन् ~ ਰਾਜਾ, योगिन् ~ ਜੋਗੀ, यशस् ~ ਜਸੁ).
--
-- A key with fewer than two letters doesn't link loosely. Tadbhava changes beyond these
-- (satya ~ ਸਤਿ/ਸਚੁ) aren't attempted. The loader prunes stale unreviewed links of every tier
-- (pipeline/shared/dict-entries.ts). Ends by linking every source already loaded.

alter table dict_entry_links drop constraint if exists dict_entry_links_match_method_check;
alter table dict_entry_links add constraint dict_entry_links_match_method_check
  check (match_method in ('exact', 'fold', 'loose', 'stem', 'manual'));

create or replace function dict_loose_key(fold text) returns text
language sql immutable parallel safe set search_path = '' as $$
  select case when length(regexp_replace(k, '[^ਅ-ਹ]', '', 'g')) >= 2 then k end
  from (
    select regexp_replace(
             translate(replace(replace(replace(fold, '੍', ''), 'ਜਞਾ', 'ਗਿਆ'), 'ਕਸ', 'ਖ'), 'ਵਯਞ', 'ਬਜਨ'),
             '[ਾਿੁੇੋ]$', '') as k
  ) x
$$;

create or replace function dict_stem_key(fold text, native text) returns text
language sql immutable parallel safe set search_path = '' as $$
  select case when native ~ '[नस]्$' and fold ~ '[ਨਸ]$' and length(regexp_replace(fold, '[^ਅ-ਹ]', '', 'g')) >= 3
              then public.dict_loose_key(left(fold, -1)) end
$$;

create index if not exists dict_entries_loose_key on dict_entries (dict_loose_key(search_fold));
create index if not exists dict_entries_stem_key on dict_entries (dict_stem_key(search_fold, headword_native));
create index if not exists words_dict_loose_key on words (dict_loose_key(search_fold));

create or replace function link_dict_entries(p_source_code text default null, p_word_ids bigint[] default null)
returns int language plpgsql set search_path = public, pg_temp as $$
declare total int := 0; n int;
begin
  insert into dict_entry_links (entry_id, word_id, match_method, confidence)
  select e.id, w.id, 'exact', 1.0
    from dict_entries e
    join dict_sources s on s.id = e.dict_source_id
    join words w on w.gurmukhi = e.headword_gurmukhi
   where (p_source_code is null or s.code = p_source_code)
     and (p_word_ids is null or w.id = any(p_word_ids))
  on conflict (entry_id, word_id) where word_id is not null do nothing;
  get diagnostics n = row_count; total := total + n;

  insert into dict_entry_links (entry_id, word_id, match_method, confidence)
  select e.id, w.id, 'fold', 0.5
    from dict_entries e
    join dict_sources s on s.id = e.dict_source_id
    join words w on w.search_fold = e.search_fold
   where e.search_fold is not null and e.search_fold <> ''
     and (p_source_code is null or s.code = p_source_code)
     and (p_word_ids is null or w.id = any(p_word_ids))
     and not exists (select 1 from words x where x.gurmukhi = e.headword_gurmukhi)
  on conflict (entry_id, word_id) where word_id is not null do nothing;
  get diagnostics n = row_count; total := total + n;

  insert into dict_entry_links (entry_id, word_id, match_method, confidence)
  select e.id, w.id, 'loose', 0.3
    from dict_entries e
    join dict_sources s on s.id = e.dict_source_id
    join words w on dict_loose_key(w.search_fold) = dict_loose_key(e.search_fold)
   where dict_loose_key(e.search_fold) is not null
     and (p_source_code is null or s.code = p_source_code)
     and (p_word_ids is null or w.id = any(p_word_ids))
  on conflict (entry_id, word_id) where word_id is not null do nothing;
  get diagnostics n = row_count; total := total + n;

  insert into dict_entry_links (entry_id, word_id, match_method, confidence)
  select e.id, w.id, 'stem', 0.2
    from dict_entries e
    join dict_sources s on s.id = e.dict_source_id and s.language = 'sa'
    join words w on dict_loose_key(w.search_fold) = dict_stem_key(e.search_fold, e.headword_native)
   where dict_stem_key(e.search_fold, e.headword_native) is not null
     and (p_source_code is null or s.code = p_source_code)
     and (p_word_ids is null or w.id = any(p_word_ids))
     and not exists (select 1 from dict_entry_links l where l.entry_id = e.id and l.match_method <> 'stem')
  on conflict (entry_id, word_id) where word_id is not null do nothing;
  get diagnostics n = row_count; total := total + n;

  return total;
end $$;

select link_dict_entries();
