-- 068: collapse doubled halants in Sri Sarbloh Granth.
--
-- Four half-lines of the typed Budha Dal text have a halant typed twice
-- (ਸਸਤ੍੍ਨ, ਨ੍੍ਪਬਰ, ਛਤ੍੍ਰ, ਪ੍੍ਸਾਦਿ): lines 169421, 169439, 171115, 173273. Each
-- became a word of its own, seen once. The build now collapses them
-- (pipeline/sarbloh/lines.ts cleanText); this fixes the loaded copy.
--
-- A misspelt word whose correct spelling is already a word (ਛਤ੍ਰ, ਸਸਤ੍ਨ) merges
-- into it: occurrences, frequency and the per-scripture/writer stats move over,
-- then the misspelling goes. One with no correct twin (ਨ੍ਪਬਰ, ਪ੍ਸਾਦਿ) is renamed,
-- search_fold with it (the fold keeps the halants, so collapsing them there
-- gives what foldGurmukhi would). Nothing else references these words, and the
-- lines carry no character offsets (vishraam, numerals) that a shorter line
-- would shift. Matching on the pattern, not the ids, makes it safe to rerun.

create temp table halant_merge as
select b.id as bad_id, g.id as good_id, b.frequency
from words b
join words g on g.gurmukhi = regexp_replace(b.gurmukhi, U&'\0A4D{2,}', U&'\0A4D', 'g')
where strpos(b.gurmukhi, U&'\0A4D\0A4D') > 0;

update word_occurrences o set word_id = m.good_id
from halant_merge m where o.word_id = m.bad_id;

update words g set frequency = g.frequency + m.f
from (select good_id, sum(frequency) as f from halant_merge group by good_id) m
where g.id = m.good_id;

insert into word_corpus_stats (word_id, source_fk, frequency)
select m.good_id, s.source_fk, sum(s.frequency)
from word_corpus_stats s join halant_merge m on m.bad_id = s.word_id
group by m.good_id, s.source_fk
on conflict (word_id, source_fk) do update set frequency = word_corpus_stats.frequency + excluded.frequency;

-- No key on this one (writer may be null), so add to a matching row or insert.
with moved as (
  select m.good_id, s.source_fk, s.writer_english, sum(s.frequency) as f
  from word_corpus_writer_stats s join halant_merge m on m.bad_id = s.word_id
  group by m.good_id, s.source_fk, s.writer_english
), bumped as (
  update word_corpus_writer_stats w set frequency = w.frequency + mv.f
  from moved mv
  where w.word_id = mv.good_id and w.source_fk = mv.source_fk
    and w.writer_english is not distinct from mv.writer_english
  returning w.word_id, w.source_fk, w.writer_english
)
insert into word_corpus_writer_stats (word_id, source_fk, writer_english, frequency)
select mv.good_id, mv.source_fk, mv.writer_english, mv.f
from moved mv
where not exists (
  select 1 from bumped b
  where b.word_id = mv.good_id and b.source_fk = mv.source_fk
    and b.writer_english is not distinct from mv.writer_english
);

-- Their stats rows go with them (on delete cascade).
delete from words where id in (select bad_id from halant_merge);

update words
set gurmukhi    = regexp_replace(gurmukhi, U&'\0A4D{2,}', U&'\0A4D', 'g'),
    search_fold = regexp_replace(search_fold, U&'\0A4D{2,}', U&'\0A4D', 'g')
where strpos(gurmukhi, U&'\0A4D\0A4D') > 0;

update lines
set gurmukhi = regexp_replace(gurmukhi, U&'\0A4D{2,}', U&'\0A4D', 'g')
where strpos(gurmukhi, U&'\0A4D\0A4D') > 0;

drop table halant_merge;
