-- 030: make the frequency refresh functions callable through PostgREST.
--
-- Two role-level constraints on `authenticator` (the role every supabase-js
-- call runs under, service-role key included) broke these:
--   1. session_preload_libraries includes `safeupdate`, which rejects any
--      UPDATE/DELETE lacking a WHERE clause — both functions had bare
--      statements ("UPDATE requires a WHERE clause").
--   2. statement_timeout = 8s, far below a full-corpus rebuild.
--
-- This is why the Bhai Gurdas ingest (#65) reported success while
-- word_corpus_stats stayed empty: the RPC failed and nothing checked it.
-- The ingest now aborts on a failed refresh, and these bodies satisfy
-- safeupdate (explicit WHERE) and raise their own statement_timeout for the
-- duration of the call. Direct SQL sessions were never affected, which is
-- why the manual re-runs worked.

create or replace function refresh_word_frequencies() returns void
language sql security definer
set search_path = public
set statement_timeout = '900s'
as $$
  update words
  set frequency = c.cnt
  from (
    select w.id, coalesce(o.cnt, 0) as cnt
    from words w
    left join (
      select word_id, count(*) as cnt from word_occurrences group by word_id
    ) o on o.word_id = w.id
  ) c
  where words.id = c.id
    and words.frequency is distinct from c.cnt;
$$;

create or replace function refresh_word_corpus_stats() returns void
language sql security definer
set search_path = public
set statement_timeout = '900s'
as $$
  delete from word_corpus_stats where true;

  insert into word_corpus_stats (word_id, source_fk, frequency)
  select wo.word_id, l.source_fk, count(*)
  from word_occurrences wo
  join lines l on l.id = wo.line_id
  group by wo.word_id, l.source_fk;

  -- A word attested in ANY ingested corpus is in-corpus. This flips words
  -- that entered as dictionary head-words (Shackle, in_corpus=false) once a
  -- newly ingested text attests them: their spelling is no longer inferred.
  update words
  set in_corpus = true
  where in_corpus = false
    and exists (select 1 from word_occurrences wo where wo.word_id = words.id);
$$;
