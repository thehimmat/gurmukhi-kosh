-- 004_pronunciation_audio.sql
-- Display pronunciation columns on words + a word_audio table for clips.
--
-- IMPORTANT: words.phonetic_ipa already exists but is the LOSSY normalized
-- fuzzy-match key owned by gurmukhi-voice-search (collapses length, tone,
-- retroflex/dental, nasals). It must never be shown to users. The new
-- ipa_display column holds faithful IPA for display.
--
-- Idempotent: safe to re-run.

alter table words add column if not exists ipa_display    text;  -- faithful IPA for display
alter table words add column if not exists roman_iso15919 text;  -- ISO 15919 romanization
alter table words add column if not exists roman_practical text; -- practical (diacritic-free) romanization

comment on column words.phonetic_ipa is
  'LOSSY normalized IPA fuzzy-match key owned by gurmukhi-voice-search. Do NOT display — use ipa_display.';

-- Audio clips per word (TTS-generated or human recordings). Population deferred.
create table if not exists word_audio (
  id            bigserial primary key,
  word_id       bigint not null references words(id) on delete cascade,
  url           text not null,
  kind          text check (kind in ('tts', 'recording')),
  speaker_note  text,
  duration_ms   int,
  provenance    text not null default 'imported'
                  check (provenance in ('scraped','imported','rule_derived','computed','ai_draft','human_verified')),
  review_status text not null default 'unreviewed'
                  check (review_status in ('unreviewed','approved','needs_work','rejected')),
  reviewed_by   text,
  reviewed_at   timestamptz,
  curation_note text,
  created_at    timestamptz default now()
);
create index if not exists word_audio_word_id on word_audio (word_id);

alter table word_audio enable row level security;
do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'word_audio' and policyname = 'public read word_audio'
  ) then
    create policy "public read word_audio" on word_audio for select using (true);
  end if;
end $$;
