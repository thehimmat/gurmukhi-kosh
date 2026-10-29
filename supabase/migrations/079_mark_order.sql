-- 079: nasal marks in Unicode order, and ਤੈ → ਤੈਂ in Dasam 130267 (thehimmat/gurmukhi-kosh#310).
--
-- BaniDB stores some tippis and bindis before the aunkar or dulainkar: ਨੰੂ for ਨੂੰ, ਸਮੰੁਦ੍ਰ for ਸਮੁੰਦ੍ਰ,
-- ਨਾੳਂੁ for ਨਾਉਂ. They render alike, but the stored words differ, so counts and search split them. This
-- puts the marks in Unicode order in every loaded line, of any source, by the rule the ingest now applies
-- (pipeline/sggs/mark-order.ts): swap the two marks, then join ੳ + ੁ/ੂ into ਉ/ਊ. Each fixed word's
-- transliteration becomes BaniDB's own for the right spelling: na(n)oo → noo(n), sama(n)udhr →
-- samu(n)dhr, final a(n) → u(n). On 2026-10-29 that was 17 lines: 13 Dasam, 4 Bhai Gurdas.
--
-- Separately, 130267 (after 073's ਭਾਗ → ਭਾਂਗ) reads ਤੈਂ in both the Hazur Sahib print (p.1202) and the
-- 1912 print (p.1181); FOLLOW_UPS in pipeline/sggs/corrections.ts holds it.
--
-- Then the same steps as 073-077: create the corrected spellings with their search_fold, rewrite each
-- line and rebuild what hangs off it, delete a misspelling left unused with nothing attached, and
-- refresh health_stats_cache. A fixed line no longer matches either rule, so rerunning is safe.

create temp table fix_lines_079 (line_id bigint, old_g text, new_g text, old_t text, new_t text);

insert into fix_lines_079
select l.id, l.gurmukhi, g.new_g, l.transliteration_en,
       case
         when l.transliteration_en is null then null
         when cardinality(string_to_array(l.gurmukhi, ' ')) <> cardinality(string_to_array(l.transliteration_en, ' '))
           then l.transliteration_en
         else (
           select string_agg(case
                    when u.ow = u.nw then u.t
                    when u.t like '%a(n)oo%' then regexp_replace(u.t, 'a\(n\)oo', 'oo(n)')
                    when u.t like '%a(n)u%' then regexp_replace(u.t, 'a\(n\)u', 'u(n)')
                    when u.ow ~ '[ੰਂ]ੁ[॥੦-੯]*$' and u.t ~ 'a\(n\)$' then regexp_replace(u.t, 'a\(n\)$', 'u(n)')
                    else u.t
                  end, ' ' order by u.n)
           from unnest(string_to_array(l.gurmukhi, ' '), string_to_array(g.new_g, ' '),
                       string_to_array(l.transliteration_en, ' ')) with ordinality u(ow, nw, t, n))
       end
from lines l,
lateral (select replace(replace(regexp_replace(l.gurmukhi, '([ੰਂ])([ੁੂ])', '\2\1', 'g'), 'ੳੁ', 'ਉ'), 'ੳੂ', 'ਊ') as new_g) g
where l.gurmukhi ~ '[ੰਂ][ੁੂ]';

insert into fix_lines_079
select l.id, f.old_g, f.new_g, f.old_t, f.new_t
from (values
  (130267, 'ਤੈ ਮੂਜੀ ਪੀ ਭਾਂਗ ਕਹੋ ਕਾ ਕਾਜ ਸਵਰਿ ਹੈਂ ॥',
           'ਤੈਂ ਮੂਜੀ ਪੀ ਭਾਂਗ ਕਹੋ ਕਾ ਕਾਜ ਸਵਰਿ ਹੈਂ ॥',
           'tai moojee pee bhaa(n)g kaho kaa kaaj savar hai(n) ||',
           'tai(n) moojee pee bhaa(n)g kaho kaa kaaj savar hai(n) ||')
) f(verse_id, old_g, new_g, old_t, new_t)
join lines l on l.verse_id = f.verse_id and l.gurmukhi = f.old_g
 and l.source_fk = (select id from sources where code = 'dasam_banidb_v2');

-- The new words of each line, in order: split on whitespace, strip dandas, pipes and tildes at either
-- end, keep a token only if it holds a Gurmukhi letter or vowel sign (lib/tokenizer.ts).
create temp table fix_tokens_079 as
select f.line_id, (row_number() over (partition by f.line_id order by t.n) - 1)::int as position, t.token
from fix_lines_079 f,
lateral (
  select n, btrim(regexp_replace(regexp_replace(raw, '[।॥|~]+$', ''), '^[।॥|~]+', '')) as token
  from regexp_split_to_table(f.new_g, '\s+') with ordinality as s(raw, n)
) t
where t.token <> '' and t.token ~ '[ਅ-ਹਾ-ੌੴ]';

-- The corrected spellings, with the search key lib/gurmukhi-fold.ts gives each (as npm run searchfold
-- would). A spelling already in words (ਨੂੰ, most of them) keeps its row.
insert into words (gurmukhi, frequency, search_fold)
select w.gurmukhi, 0, w.search_fold
from (values
  ('ਅਫਜੂੰ', 'ਅਫਜੁੰ'),
  ('ਕਾਹੂੰ', 'ਕਾਹੁੰ'),
  ('ਗਲਹੁੰ', 'ਗਲਹੁੰ'),
  ('ਤਿਨਹੂੰ', 'ਤਿਨਹੁੰ'),
  ('ਤੈਂ', 'ਤੇੰ'),
  ('ਧੁੰਧੂਕਾਰੁ', 'ਧੁੰਧੁਕਾਰ'),
  ('ਨਾਉਂ', 'ਨਾਉੰ'),
  ('ਨੁੰ', 'ਨੁੰ'),
  ('ਨੂੰ', 'ਨੁੰ'),
  ('ਰੁੰਡ', 'ਰੁੰਦ'),
  ('ਸਮੁੰਦ੍ਰ', 'ਸਮੁੰਦ੍ਰ'),
  ('ਹੂੰ', 'ਹੁੰ')
) w(gurmukhi, search_fold)
on conflict (gurmukhi) do nothing;

do $$
declare missing text;
begin
  select string_agg(distinct t.token, ', ') into missing
  from fix_tokens_079 t where not exists (select 1 from words w where w.gurmukhi = t.token);
  if missing is not null then
    raise exception '079: token(s) with no word: %', missing;
  end if;
end $$;

-- Every word these lines used before or use now.
create temp table fix_words_079 as
select distinct o.word_id from word_occurrences o join fix_lines_079 f on f.line_id = o.line_id
union
select distinct w.id from fix_tokens_079 t join words w on w.gurmukhi = t.token;

delete from word_occurrences o using fix_lines_079 f where o.line_id = f.line_id;

insert into word_occurrences (word_id, line_id, position)
select w.id, t.line_id, t.position from fix_tokens_079 t join words w on w.gurmukhi = t.token;

-- Numerals after the first changed character move by the change in length.
update number_occurrences n
set char_start = n.char_start + d.delta, char_end = n.char_end + d.delta
from (
  select f.line_id,
         char_length(f.new_g) - char_length(f.old_g) as delta,
         coalesce((select min(i) - 1 from generate_series(1, least(char_length(f.old_g), char_length(f.new_g))) i
                   where substr(f.old_g, i, 1) <> substr(f.new_g, i, 1)),
                  least(char_length(f.old_g), char_length(f.new_g))) as at
  from fix_lines_079 f
) d
where n.line_id = d.line_id and d.delta <> 0 and n.char_start >= d.at;

update lines l set gurmukhi = f.new_g, transliteration_en = f.new_t
from fix_lines_079 f where l.id = f.line_id;

update lines l set first_letters = k.letters
from (
  select o.line_id, first_letter_fold(string_agg(left(w.gurmukhi, 1), '' order by o.position)) as letters
  from word_occurrences o join words w on w.id = o.word_id
  where o.line_id in (select line_id from fix_lines_079)
  group by o.line_id
) k
where l.id = k.line_id;

-- Counts for the touched words, as refresh_word_frequencies / refresh_word_corpus_stats /
-- refresh_word_corpus_writer_stats compute them, limited to these words.
update words w
set frequency = (select count(*) from word_occurrences o join lines l on l.id = o.line_id
                 where o.word_id = w.id and l.is_public)
where w.id in (select word_id from fix_words_079);

delete from word_corpus_stats where word_id in (select word_id from fix_words_079);
insert into word_corpus_stats (word_id, source_fk, frequency)
select o.word_id, l.source_fk, count(*)
from word_occurrences o join lines l on l.id = o.line_id
where o.word_id in (select word_id from fix_words_079)
group by o.word_id, l.source_fk;

delete from word_corpus_writer_stats where word_id in (select word_id from fix_words_079);
insert into word_corpus_writer_stats (word_id, source_fk, writer_english, frequency)
select o.word_id, l.source_fk, s.writer_english, count(*)
from word_occurrences o join lines l on l.id = o.line_id left join shabads s on s.id = l.shabad_id
where o.word_id in (select word_id from fix_words_079)
group by o.word_id, l.source_fk, s.writer_english;

-- A misspelling now unused, with nothing attached to it, goes. "Attached" is any row in a table with a
-- foreign key to words, read from the catalog, except the derived counts (rebuilt above or by
-- pipeline/compute), whose rows cascade with it.
do $$
declare
  w bigint;
  r record;
  used boolean;
begin
  for w in
    select f.word_id from fix_words_079 f
    where not exists (select 1 from word_occurrences o where o.word_id = f.word_id)
  loop
    used := false;
    for r in
      select c.conrelid::regclass as tbl, a.attname as col
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
      where c.contype = 'f' and c.confrelid = 'words'::regclass
        and c.conrelid not in ('word_occurrences'::regclass, 'word_corpus_stats'::regclass,
                               'word_corpus_writer_stats'::regclass, 'bigrams'::regclass,
                               'collocations'::regclass)
    loop
      execute format('select exists (select 1 from %s where %I = $1)', r.tbl, r.col) into used using w;
      exit when used;
    end loop;
    if not used then
      delete from words where id = w;
    end if;
  end loop;
end $$;

drop table fix_lines_079, fix_tokens_079, fix_words_079;

-- The word total changed: refresh the totals the health page reads (075), as an ingest does.
select refresh_health_stats();
