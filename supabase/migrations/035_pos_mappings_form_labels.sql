-- 035_pos_mappings_form_labels.sql
-- #29: map the Shackle POS labels migration 023 deliberately left unmapped,
-- now that the word page, /health and the autoflag pass all read pos_mappings.
--
-- Decisions (checked against the entries that carry each label, 2026-09-30):
--   past participle / participle / present / imperative -> verb
--       Verb-form and tense labels Shackle puts in the POS slot (ਵੈੰਦਾ "going",
--       ਜੀਜੈ "lives", ਚਉ "speak"). The form detail belongs on word_forms (#30);
--       as a part of speech these are verbs. The raw label is still shown.
--   emphatic -> particle
--       ਹੀ, ਭਿ, -ਈ "only, indeed, also": emphatic particles.
--
-- Not mapped here, by design: possessive / negative / enclitic. They only occur
-- alongside a real POS ("possessive; pronoun", "negative; adverb") and qualify
-- it; lib/grammar-view.ts drops them from the POS reading in that case.
-- Compound "a; b" strings need no rows: the reader splits on ";" (the ingest
-- joined Shackle's partOfSpeech array) and maps each part.

insert into pos_mappings (source_code, pos_raw, pos_norm) values
  ('shackle', 'past participle', 'verb'),
  ('shackle', 'participle', 'verb'),
  ('shackle', 'present', 'verb'),
  ('shackle', 'imperative', 'verb'),
  ('shackle', 'emphatic', 'particle')
on conflict (source_code, pos_raw) do nothing;
