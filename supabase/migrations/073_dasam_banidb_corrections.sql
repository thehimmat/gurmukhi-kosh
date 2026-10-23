-- 073: lines BaniDB mistyped in the Dasam Granth.
--
-- Twelve lines, checked against printed sources (pipeline/sggs/corrections.ts holds the same list with
-- the evidence for each, and the ingest now applies it, so a re-ingest keeps them fixed):
--   * ਮੁਿਹ, ਘੇਿਰ, ਬੁੱਿਧ: a sihari attached to the wrong letter (legacy-font conversion) → ਮੁਹਿ, ਘੇਰਿ, ਬੁੱਧਿ;
--   * ਜੋਉੂ: ਉ + ੂ stored for ਊ → ਜੋਊ;
--   * ਤਾਂੈ ਹਮਰੀ ਬਾਤ ਕਹ ਜਾਨੈ → ਤੈਂ ਹਮਰੀ ਬਾਤ ਨ ਕਹਾ ਜਾਨੈ (one word more);
--   * ਭਾਗ → ਭਾਂਗ in the seven bhang lines of Charitar 266 (matched by line; ਭਾਗ elsewhere is a real word).
--
-- For each line still holding BaniDB's text, this rewrites the line and its transliteration and rebuilds
-- what hangs off it: its word occurrences (tokenised as lib/tokenizer.ts does), its first-letter key,
-- its numeral offsets (a longer word shifts the numeral after it), and the total, per-corpus and
-- per-writer counts of every word it touched. A misspelling left with no occurrence and nothing
-- attached is deleted. Every corrected spelling is already a word, so no word is created (and none
-- needs a search_fold); if one were missing this stops rather than create it half-built.
-- Matching on the old text, not the line ids, makes it safe to rerun.

create temp table fix_073 (verse_id int, old_g text, new_g text, old_t text, new_t text);
insert into fix_073 values
  (80315, 'ਦੁਹਾ ਕੰਧਾਰਾ ਮੁਿਹ ਜੁੜੇ ਅਣੀਆਰਾ ਚੋਈਆਂ ॥',
          'ਦੁਹਾ ਕੰਧਾਰਾ ਮੁਹਿ ਜੁੜੇ ਅਣੀਆਰਾ ਚੋਈਆਂ ॥',
          'dhuhaa ka(n)dhaaraa mueh juRe aneeaaraa choieeaa(n) ||',
          'dhuhaa ka(n)dhaaraa muh juRe aneeaaraa choieeaa(n) ||'),
  (80317, 'ਹੂਰਾਂ ਸ੍ਰਣਵਤ ਬੀਜ ਨੰੂ ਘਤਿ ਘੇਿਰ ਖਲੋਈਆਂ ॥',
          'ਹੂਰਾਂ ਸ੍ਰਣਵਤ ਬੀਜ ਨੰੂ ਘਤਿ ਘੇਰਿ ਖਲੋਈਆਂ ॥',
          'hooraa(n) sranavat beej na(n)oo ghat ghir khaloieeaa(n) ||',
          'hooraa(n) sranavat beej na(n)oo ghat gher khaloieeaa(n) ||'),
  (130072, 'ਤਾਂੈ ਹਮਰੀ ਬਾਤ ਕਹ ਜਾਨੈ ॥',
          'ਤੈਂ ਹਮਰੀ ਬਾਤ ਨ ਕਹਾ ਜਾਨੈ ॥',
          'taa(n)ai hamaree baat keh jaanai ||',
          'tai(n) hamaree baat na kahaa jaanai ||'),
  (130073, 'ਭਾਗ ਖਾਇ ਕੈ ਬੈਨ ਪ੍ਰਮਾਨੈ ॥੩੬॥',
          'ਭਾਂਗ ਖਾਇ ਕੈ ਬੈਨ ਪ੍ਰਮਾਨੈ ॥੩੬॥',
          'bhaag khai kai bain pramaanai ||36||',
          'bhaa(n)g khai kai bain pramaanai ||36||'),
  (130077, 'ਭਾਗ ਪੀਏ ਬੁਧਿ ਜਾਤ ਨ ਹਰੀ ॥',
          'ਭਾਂਗ ਪੀਏ ਬੁਧਿ ਜਾਤ ਨ ਹਰੀ ॥',
          'bhaag pe''ee budh jaat na haree ||',
          'bhaa(n)g pe''ee budh jaat na haree ||'),
  (130080, 'ਕਬ ਹੀ ਭੂਲਿ ਨ ਭਾਗ ਚੜਾਵਤ ॥',
          'ਕਬ ਹੀ ਭੂਲਿ ਨ ਭਾਂਗ ਚੜਾਵਤ ॥',
          'kab hee bhool na bhaag chaRaavat ||',
          'kab hee bhool na bhaa(n)g chaRaavat ||'),
  (130171, 'ਭਾਗ ਨ ਏਤੇ ਪਰ ਭਖੈ ਜਾਨਤ ਆਪ ਸੁਚੇਤ ॥੫੮॥',
          'ਭਾਂਗ ਨ ਏਤੇ ਪਰ ਭਖੈ ਜਾਨਤ ਆਪ ਸੁਚੇਤ ॥੫੮॥',
          'bhaag na ete par bhakhai jaanat aap suchet ||58||',
          'bhaa(n)g na ete par bhakhai jaanat aap suchet ||58||'),
  (130263, 'ਕਹਾ ਭਯੌ ਜੌ ਭਾਗ ਭੂਲਿ ਭੌਂਦੂ ਨਹਿ ਖਾਈ ॥',
          'ਕਹਾ ਭਯੌ ਜੌ ਭਾਂਗ ਭੂਲਿ ਭੌਂਦੂ ਨਹਿ ਖਾਈ ॥',
          'kahaa bhayau jau bhaag bhool bhaua(n)dhoo neh khaiee ||',
          'kahaa bhayau jau bhaa(n)g bhool bhaua(n)dhoo neh khaiee ||'),
  (130265, 'ਭਾਗ ਖਾਇ ਭਟ ਭਿੜਹਿ ਗਜਨ ਕੇ ਦਾਤ ਉਪਾਰਹਿ ॥',
          'ਭਾਂਗ ਖਾਇ ਭਟ ਭਿੜਹਿ ਗਜਨ ਕੇ ਦਾਤ ਉਪਾਰਹਿ ॥',
          'bhaag khai bhaT bhiReh gajan ke dhaat upaareh ||',
          'bhaa(n)g khai bhaT bhiReh gajan ke dhaat upaareh ||'),
  (130267, 'ਤੈ ਮੂਜੀ ਪੀ ਭਾਗ ਕਹੋ ਕਾ ਕਾਜ ਸਵਰਿ ਹੈਂ ॥',
          'ਤੈ ਮੂਜੀ ਪੀ ਭਾਂਗ ਕਹੋ ਕਾ ਕਾਜ ਸਵਰਿ ਹੈਂ ॥',
          'tai moojee pee bhaag kaho kaa kaaj savar hai(n) ||',
          'tai moojee pee bhaa(n)g kaho kaa kaaj savar hai(n) ||'),
  (141915, 'ਨਮੋ ਰਿੱਧ ਦਾ ਸਿੱਧਿ ਦਾ ਬੁੱਿਧ ਦੈਨੀ ॥',
          'ਨਮੋ ਰਿੱਧ ਦਾ ਸਿੱਧਿ ਦਾ ਬੁੱਧਿ ਦੈਨੀ ॥',
          'namo ri''dh dhaa si''dh dhaa bu''idh dhainee ||',
          'namo ri''dh dhaa si''dh dhaa bu''dh dhainee ||'),
  (402922, 'ਜੋਉੂ ਮਯਾਨ ਤੇ ਵੀਰ ਤੋ ਕੋ ਸੜੱਕੈ ॥',
          'ਜੋਊ ਮਯਾਨ ਤੇ ਵੀਰ ਤੋ ਕੋ ਸੜੱਕੈ ॥',
          'joauoo mayaan te veer to ko saRa''kai ||',
          'jouoo mayaan te veer to ko saRa''kai ||');

create temp table fix_lines_073 as
select l.id as line_id, f.*
from fix_073 f
join lines l on l.verse_id = f.verse_id and l.gurmukhi = f.old_g
 and l.source_fk = (select id from sources where code = 'dasam_banidb_v2');

-- The new words of each line, in order: split on whitespace, strip dandas, pipes and tildes at either
-- end, keep a token only if it holds a Gurmukhi letter or vowel sign (lib/tokenizer.ts).
create temp table fix_tokens_073 as
select f.line_id, (row_number() over (partition by f.line_id order by t.n) - 1)::int as position, t.token
from fix_lines_073 f,
lateral (
  select n, btrim(regexp_replace(regexp_replace(raw, '[।॥|~]+$', ''), '^[।॥|~]+', '')) as token
  from regexp_split_to_table(f.new_g, '\s+') with ordinality as s(raw, n)
) t
where t.token <> '' and t.token ~ '[ਅ-ਹਾ-ੌੴ]';

do $$
declare missing text;
begin
  select string_agg(distinct t.token, ', ') into missing
  from fix_tokens_073 t where not exists (select 1 from words w where w.gurmukhi = t.token);
  if missing is not null then
    raise exception '073: corrected spelling(s) not yet a word: %', missing;
  end if;
end $$;

-- Every word these lines used before or use now.
create temp table fix_words_073 as
select distinct o.word_id from word_occurrences o join fix_lines_073 f on f.line_id = o.line_id
union
select distinct w.id from fix_tokens_073 t join words w on w.gurmukhi = t.token;

delete from word_occurrences o using fix_lines_073 f where o.line_id = f.line_id;

insert into word_occurrences (word_id, line_id, position)
select w.id, t.line_id, t.position from fix_tokens_073 t join words w on w.gurmukhi = t.token;

-- Numerals after the first changed character move by the change in length.
update number_occurrences n
set char_start = n.char_start + d.delta, char_end = n.char_end + d.delta
from (
  select f.line_id,
         char_length(f.new_g) - char_length(f.old_g) as delta,
         coalesce((select min(i) - 1 from generate_series(1, least(char_length(f.old_g), char_length(f.new_g))) i
                   where substr(f.old_g, i, 1) <> substr(f.new_g, i, 1)),
                  least(char_length(f.old_g), char_length(f.new_g))) as at
  from fix_lines_073 f
) d
where n.line_id = d.line_id and d.delta <> 0 and n.char_start >= d.at;

update lines l set gurmukhi = f.new_g, transliteration_en = f.new_t
from fix_lines_073 f where l.id = f.line_id;

update lines l set first_letters = k.letters
from (
  select o.line_id, first_letter_fold(string_agg(left(w.gurmukhi, 1), '' order by o.position)) as letters
  from word_occurrences o join words w on w.id = o.word_id
  where o.line_id in (select line_id from fix_lines_073)
  group by o.line_id
) k
where l.id = k.line_id;

-- Counts for the touched words, as refresh_word_frequencies / refresh_word_corpus_stats /
-- refresh_word_corpus_writer_stats compute them, limited to these words.
update words w
set frequency = (select count(*) from word_occurrences o join lines l on l.id = o.line_id
                 where o.word_id = w.id and l.is_public)
where w.id in (select word_id from fix_words_073);

delete from word_corpus_stats where word_id in (select word_id from fix_words_073);
insert into word_corpus_stats (word_id, source_fk, frequency)
select o.word_id, l.source_fk, count(*)
from word_occurrences o join lines l on l.id = o.line_id
where o.word_id in (select word_id from fix_words_073)
group by o.word_id, l.source_fk;

delete from word_corpus_writer_stats where word_id in (select word_id from fix_words_073);
insert into word_corpus_writer_stats (word_id, source_fk, writer_english, frequency)
select o.word_id, l.source_fk, s.writer_english, count(*)
from word_occurrences o join lines l on l.id = o.line_id left join shabads s on s.id = l.shabad_id
where o.word_id in (select word_id from fix_words_073)
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
    select f.word_id from fix_words_073 f
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

drop table fix_073, fix_lines_073, fix_tokens_073, fix_words_073;
