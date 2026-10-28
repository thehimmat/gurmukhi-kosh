-- 077: the last seven Dasam lines with BaniDB's ਾਂ after a vowel sign (thehimmat/gurmukhi-kosh#312).
--
-- All seven have a nasal after ਹਿ, which 076 held back until the Hazur mark was looked at again: a bindi
-- in 106630, 113536, 118908, 118909 and 129315 (ਡਮਕਹਿਂ), a tippi in 126247 and 126395 (ਧਾਵਹਿੰ).
-- pipeline/sggs/nasal-corrections.ts (NASAL_HI) holds the same list with the evidence for each, and the
-- ingest applies it. Same steps as 076: create the corrected spellings with their search_fold, rewrite
-- each line still holding BaniDB's text and rebuild what hangs off it, delete a misspelling left unused
-- with nothing attached, and refresh health_stats_cache. Matching on the old text makes it safe to rerun.

create temp table fix_077 (verse_id int, old_g text, new_g text, old_t text, new_t text);
insert into fix_077 values
  (106630, 'ਜਮੁਨਾ ਪ੍ਰਿਥਮ ਬਖਾਨਿ ਕੈ ਏਸਰਾਯੁਧਹਿਾਂ ਬਖਾਨ ॥',
          'ਜਮੁਨਾ ਪ੍ਰਿਥਮ ਬਖਾਨਿ ਕੈ ਏਸਰਾਯੁਧਹਿਂ ਬਖਾਨ ॥',
          'jamunaa piratham bakhaan kai esaraayudhahiaa(n) bakhaan ||',
          'jamunaa piratham bakhaan kai esaraayudhahi(n) bakhaan ||'),
  (113536, 'ਕਹੂੰ ਪਾਖਰੇ ਹੈ ਹਿਾਂਹਨਾਹੀ ॥',
          'ਕਹੂੰ ਪਾਖਰੇ ਹੈ ਹਿਂਹਨਾਹੀ ॥',
          'kahoo(n) paakhare hai hiaa(n)hanaahee ||',
          'kahoo(n) paakhare hai hi(n)hanaahee ||'),
  (118908, 'ਡਿਮਿ ਡਿਮਿ ਡਿਮਿ ਡਾਮਰੂ ਡਮਕਹਿਾਂ ॥',
          'ਡਿਮਿ ਡਿਮਿ ਡਿਮਿ ਡਾਮਰੂ ਡਮਕਹਿਂ ॥',
          'ddim ddim ddim ddaamaroo ddamakahiaa(n) ||',
          'ddim ddim ddim ddaamaroo ddamakahi(n) ||'),
  (118909, 'ਅਸਿ ਅਨੇਕ ਹਾਥਨ ਮਹਿੰ ਦਮਕਹਿਾਂ ॥',
          'ਅਸਿ ਅਨੇਕ ਹਾਥਨ ਮਹਿੰ ਦਮਕਹਿਂ ॥',
          'as anek haathan mahi(n) dhamakahiaa(n) ||',
          'as anek haathan mahi(n) dhamakahi(n) ||'),
  (126247, 'ਅਮਿਤਿ ਸੁਭਟ ਧਾਵਹਿਾਂ ਮਿਲਿ ਕੋਈ ॥੩੭॥',
          'ਅਮਿਤਿ ਸੁਭਟ ਧਾਵਹਿੰ ਮਿਲਿ ਕੋਈ ॥੩੭॥',
          'amit subhaT dhaavahiaa(n) mil koiee ||37||',
          'amit subhaT dhaavahi(n) mil koiee ||37||'),
  (126395, 'ਹੋ ਬੀਤਹਿਾਂ ਬਰਸ ਪਚਾਸ ਨ ਜਾਨੋ ਏਕ ਦਿਨ ॥੬॥',
          'ਹੋ ਬੀਤਹਿੰ ਬਰਸ ਪਚਾਸ ਨ ਜਾਨੋ ਏਕ ਦਿਨ ॥੬॥',
          'ho beetahiaa(n) baras pachaas na jaano ek dhin ||6||',
          'ho beetahi(n) baras pachaas na jaano ek dhin ||6||'),
  (129315, 'ਹੋ ਸਪਤ ਮਾਤ੍ਰ ਕੁਲ ਸਪਤ ਪਿਤਰ ਕੁਲ ਤਰਹਿਾਂਗੇ ॥੫॥',
          'ਹੋ ਸਪਤ ਮਾਤ੍ਰ ਕੁਲ ਸਪਤ ਪਿਤਰ ਕੁਲ ਤਰਹਿਂਗੇ ॥੫॥',
          'ho sapat maatr kul sapat pitar kul tarahiaa(n)ge ||5||',
          'ho sapat maatr kul sapat pitar kul tarahi(n)ge ||5||');

create temp table fix_lines_077 as
select l.id as line_id, f.*
from fix_077 f
join lines l on l.verse_id = f.verse_id and l.gurmukhi = f.old_g
 and l.source_fk = (select id from sources where code = 'dasam_banidb_v2');

-- The new words of each line, in order: split on whitespace, strip dandas, pipes and tildes at either
-- end, keep a token only if it holds a Gurmukhi letter or vowel sign (lib/tokenizer.ts).
create temp table fix_tokens_077 as
select f.line_id, (row_number() over (partition by f.line_id order by t.n) - 1)::int as position, t.token
from fix_lines_077 f,
lateral (
  select n, btrim(regexp_replace(regexp_replace(raw, '[।॥|~]+$', ''), '^[।॥|~]+', '')) as token
  from regexp_split_to_table(f.new_g, '\s+') with ordinality as s(raw, n)
) t
where t.token <> '' and t.token ~ '[ਅ-ਹਾ-ੌੴ]';

-- The corrected spellings, with the search key lib/gurmukhi-fold.ts gives each (as npm run searchfold
-- would). A spelling already in words keeps its row.
insert into words (gurmukhi, frequency, search_fold)
select w.gurmukhi, 0, w.search_fold
from (values
  ('ਏਸਰਾਯੁਧਹਿਂ', 'ਏਸਰਾਯੁਧਹਿੰ'),
  ('ਡਮਕਹਿਂ', 'ਦਮਕਹਿੰ'),
  ('ਤਰਹਿਂਗੇ', 'ਤਰਹਿੰਗੇ'),
  ('ਦਮਕਹਿਂ', 'ਦਮਕਹਿੰ'),
  ('ਧਾਵਹਿੰ', 'ਧਾਵਹਿੰ'),
  ('ਬੀਤਹਿੰ', 'ਬਿਤਹਿੰ'),
  ('ਹਿਂਹਨਾਹੀ', 'ਹਿੰਹਨਾਹ')
) w(gurmukhi, search_fold)
on conflict (gurmukhi) do nothing;

do $$
declare missing text;
begin
  select string_agg(distinct t.token, ', ') into missing
  from fix_tokens_077 t where not exists (select 1 from words w where w.gurmukhi = t.token);
  if missing is not null then
    raise exception '077: token(s) with no word: %', missing;
  end if;
end $$;

-- Every word these lines used before or use now.
create temp table fix_words_077 as
select distinct o.word_id from word_occurrences o join fix_lines_077 f on f.line_id = o.line_id
union
select distinct w.id from fix_tokens_077 t join words w on w.gurmukhi = t.token;

delete from word_occurrences o using fix_lines_077 f where o.line_id = f.line_id;

insert into word_occurrences (word_id, line_id, position)
select w.id, t.line_id, t.position from fix_tokens_077 t join words w on w.gurmukhi = t.token;

-- Numerals after the first changed character move by the change in length.
update number_occurrences n
set char_start = n.char_start + d.delta, char_end = n.char_end + d.delta
from (
  select f.line_id,
         char_length(f.new_g) - char_length(f.old_g) as delta,
         coalesce((select min(i) - 1 from generate_series(1, least(char_length(f.old_g), char_length(f.new_g))) i
                   where substr(f.old_g, i, 1) <> substr(f.new_g, i, 1)),
                  least(char_length(f.old_g), char_length(f.new_g))) as at
  from fix_lines_077 f
) d
where n.line_id = d.line_id and d.delta <> 0 and n.char_start >= d.at;

update lines l set gurmukhi = f.new_g, transliteration_en = f.new_t
from fix_lines_077 f where l.id = f.line_id;

update lines l set first_letters = k.letters
from (
  select o.line_id, first_letter_fold(string_agg(left(w.gurmukhi, 1), '' order by o.position)) as letters
  from word_occurrences o join words w on w.id = o.word_id
  where o.line_id in (select line_id from fix_lines_077)
  group by o.line_id
) k
where l.id = k.line_id;

-- Counts for the touched words, as refresh_word_frequencies / refresh_word_corpus_stats /
-- refresh_word_corpus_writer_stats compute them, limited to these words.
update words w
set frequency = (select count(*) from word_occurrences o join lines l on l.id = o.line_id
                 where o.word_id = w.id and l.is_public)
where w.id in (select word_id from fix_words_077);

delete from word_corpus_stats where word_id in (select word_id from fix_words_077);
insert into word_corpus_stats (word_id, source_fk, frequency)
select o.word_id, l.source_fk, count(*)
from word_occurrences o join lines l on l.id = o.line_id
where o.word_id in (select word_id from fix_words_077)
group by o.word_id, l.source_fk;

delete from word_corpus_writer_stats where word_id in (select word_id from fix_words_077);
insert into word_corpus_writer_stats (word_id, source_fk, writer_english, frequency)
select o.word_id, l.source_fk, s.writer_english, count(*)
from word_occurrences o join lines l on l.id = o.line_id left join shabads s on s.id = l.shabad_id
where o.word_id in (select word_id from fix_words_077)
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
    select f.word_id from fix_words_077 f
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

drop table fix_077, fix_lines_077, fix_tokens_077, fix_words_077;

-- The word total changed: refresh the totals the health page reads (075), as an ingest does.
select refresh_health_stats();
