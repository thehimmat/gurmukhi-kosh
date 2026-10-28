# Applied-migration ledger — shared Supabase project `brczghxvpfikezsevbkh`

Three repos have historically applied migrations to this one database: **gurmukhi-kosh**
(this repo, `supabase/migrations/001..031`), **gurmukhi-search** (`001..007`), and
**gurmukhi-voice-search** (`001`). Their numbering collides and, until this ledger, nothing
recorded what had been applied or in what order. This file plus the server-side ledger fix
that (#101).

## Governance (decided in #101)

1. **gurmukhi-kosh owns the schema.** Every future migration lands in THIS repo's
   `supabase/migrations/` with the next `NNN_` number, even when the motivating feature
   lives in gurmukhi-search or gurmukhi-voice-search. Sibling repos add no new migration
   files.
2. **Apply through the Supabase MCP `apply_migration`** (or the Supabase CLI) so the
   server-side ledger (`supabase_migrations.schema_migrations`) records it, using the
   file's exact name. Then append a row to the table below in the same commit.
3. **The server ledger is the authority on applied order** (timestamp versions; readable
   via the MCP `list_migrations`). This file is its in-repo mirror plus the
   file-to-ledger reconciliation.
4. Sibling repos' historical migrations are vendored read-only under
   `supabase/migrations-imported/<repo>/` so CI's RLS gate lints everything that shaped
   this database. They are records of what ran, not scripts to re-run. The UNFILED entries'
   SQL, copied from the server ledger, is under `supabase/migrations-imported/unfiled/`, and
   statements run by hand in the dashboard SQL editor are under
   `supabase/migrations-imported/dashboard/`.
6. **Migrations are tested locally first** (`tests/db/`, #242): `npm test` replays everything
   above into an in-process Postgres in ledger order. Anything applied outside a repo migration
   file (a dashboard statement) is also added to `supabase/migrations-imported/dashboard/` and
   to the replay order in `tests/db/replay.ts`, so the replay keeps matching production.
5. RPC signatures shared with deployed clients change **add-then-remove**, never in
   place (two apps deploy against this schema independently).

## Reconciliation: server ledger vs repo files (as of 2026-09-01)

46 server-ledger entries; 39 repo files. Seven applied migrations have no file in any
repo (marked **UNFILED** — their SQL exists only in the database), and one repo file has
no ledger entry (applied via the dashboard SQL editor, marked below the table).

| # | Applied (ledger version) | Ledger name | Repo file |
|---|---|---|---|
| 1 | 20260521172611 | initial_schema | kosh `001_schema.sql` |
| 2 | 20260521172733 | rls_read_policies | **UNFILED** (early read policies; superseded by `022_rls_lockdown`) |
| 3 | 20260521204516 | add_sources_table | **UNFILED** (later folded into `001_schema.sql` as it stands today) |
| 4 | 20260526175322 | search_functions | search `001_search_functions.sql` |
| 5 | 20260528152334 | word_features | kosh `002_word_features.sql` |
| 6 | 20260603151852 | add_phonetic_ipa_voice_search | voice-search `001_add_phonetic_ipa.sql` |
| 7 | 20260603152332 | bulk_update_phonetic_ipa_fn | **UNFILED** (voice-search) |
| 8 | 20260603181130 | improve_phonetic_search_word_similarity | **UNFILED** (voice-search) |
| 9 | 20260603181237 | fix_phonetic_search_explicit_threshold | **UNFILED** (voice-search) |
| 10 | 20260611031618 | provenance_review | kosh `003_provenance_review.sql` |
| 11 | 20260611031633 | pronunciation_audio | kosh `004_pronunciation_audio.sql` |
| 12 | 20260611031638 | word_sets | kosh `005_word_sets.sql` |
| 13 | 20260622140406 | 006_computed_layers | kosh `006_computed_layers.sql` |
| 14 | 20260622211940 | 007_fix_stem_groups_index | kosh `007_fix_stem_groups_index.sql` |
| 15 | 20260625130346 | word_and_letterset_functions | search `002_word_and_letterset_functions.sql` |
| 16 | 20260626043027 | 008_writer_stats_name | kosh `008_writer_stats_name.sql` |
| 17 | 20260629035219 | optimize_lines_by_word_ids | search `003_optimize_lines_by_word_ids.sql` |
| 18 | 20260629040129 | lines_by_word_ids_dynamic_plan | **UNFILED** (search follow-up to its 003) |
| 19 | 20260629184927 | words_index | search `004_words_index.sql` |
| 20 | 20260630045034 | grammar_rules | kosh `009_grammar_rules.sql` |
| 21 | 20260630052040 | line_translations | kosh `010_line_translations.sql` |
| 22 | 20260630142245 | 011_grammar_padarth | kosh `011_grammar_padarth.sql` |
| 23 | 20260630165703 | 012_verb_form_rules | kosh `012_verb_form_rules.sql` |
| 24 | 20260701030649 | health_stats | kosh `013_health_stats.sql` |
| 25 | 20260701031419 | health_stats_timeout | **UNFILED** (kosh tweak to `013_health_stats.sql`) |
| 26 | 20260701052006 | flags | kosh `014_flags.sql` |
| 27 | 20260701145403 | health_stats_flags | kosh `015_health_stats_flags.sql` |
| 28 | 20260701153722 | flag_heatmap | kosh `016_flag_heatmap.sql` |
| 29 | 20260716135857 | 017_sikhri_source | kosh `017_sikhri_source.sql` |
| 30 | 20260722131028 | 018_shackle_source | kosh `018_shackle_source.sql` |
| 31 | 20260722131423 | 018b_etymology_source_code | **UNFILED** (kosh follow-up to 018) |
| 32 | 20260723044042 | 019_scoped_delete_indexes | kosh `019_scoped_delete_indexes.sql` |
| 33 | 20260723050615 | 020_spelling_candidate | kosh `020_spelling_candidate.sql` |
| 34 | 20260723060735 | 021_spelling_review | kosh `021_spelling_review.sql` |
| 35 | 20260728162542 | rls_lockdown | kosh `022_rls_lockdown.sql` |
| 36 | 20260804000001 | lexeme_form_model | kosh `023_lexeme_form_model.sql` |
| 37 | 20260805212506 | definitions_parsed | kosh `024_definitions_parsed.sql` |
| 38 | 20260811204717 | 026_inflection_desc_direct_rename | kosh `026_inflection_desc_direct_rename.sql` |
| 39 | 20260812175353 | 027_words_search_fold | kosh `027_words_search_fold.sql` |
| 40 | 20260815181910 | 028_word_corpus_stats | kosh `028_word_corpus_stats.sql` |
| 41 | 20260816182316 | 029_dasam_bani_source | kosh `029_dasam_bani_source.sql` |
| 42 | 20260818005344 | 030_refresh_fns_postgrest_safe | kosh `030_refresh_fns_postgrest_safe.sql` |
| 43 | 20260827220032 | lines_corpus_rank | kosh `031_lines_corpus_rank.sql` |
| 44 | 20260827220226 | corpus_ordered_search | search `005_corpus_ordered_search.sql` |
| 45 | 20260828151712 | multi_select_filters | search `006_multi_select_filters.sql` |
| 46 | 20260828152404 | search_rpc_single_value_compat | search `007_single_value_rpc_compat.sql` |
| 47 |  20260917191135 | 032_number_occurrences | kosh `032_number_occurrences.sql` |

`number_occurrences` was populated on 2026-09-20 by a one-time server-side SQL
transliteration of `lib/gurmukhi-numerals.ts` (48,119 rows), verified against that
classifier and then dropped. `npm run ingest:numbers` is the supported rebuild and
replaces those rows wholesale — see `pipeline/numbers/populate.ts`.

| 48 | 20260923123133 | 033_number_search_rpcs | kosh `033_number_search_rpcs.sql` |

Migration 033 adds `list_number_roles` and `search_number_lines`, whose only consumer is
the **gurmukhi-search** shell. It lands here per rule 1 above: kosh owns the schema even
when the motivating feature lives in a sibling repo.

| 49 | 20260923131352 | 034_number_lines_all_offsets | kosh `034_number_lines_all_offsets.sql` |

Migration 034 adds `char_starts`/`char_ends` to `search_number_lines` so a line holding the
same number twice highlights both. The scalar `char_start`/`char_end` stay until search has
shipped against the arrays — rule 5, add-then-remove for signatures a deployed sibling reads.
Migration 036 dropped them.

| 50 | 20260930142606 | 035_pos_mappings_form_labels | kosh `035_pos_mappings_form_labels.sql` |

Migration 035 seeds the five Shackle POS labels 023 left unmapped (#29). Data only; the
table's reader landed in the same change (`lib/grammar-view.ts` `normalizePos`).

| 51 | 20260930143950 | 036_number_lines_drop_scalar_offsets | kosh `036_number_lines_drop_scalar_offsets.sql` |
| 52 | 20261007192220 | 038_sarbloh_sources | kosh `038_sarbloh_sources.sql` |

Kosh `039_merge_sarbloh_sources.sql` (2026-10-07) has no server-ledger entry. Its line move and the stats
rebuild ran through the MCP. The rest of it ran from the dashboard SQL editor, because the MCP holds back
destructive statements for a confirmation: the delete of the emptied avatar source row and the description
update. The file is idempotent.

| 53 | 20261009223201 | 040_word_forms_readings | kosh `040_word_forms_readings.sql` |

Migration 040 drops 002's `(lexeme_id, word_id)` unique index so a membership can carry several
readings and sources (#30 decision 4), ahead of the Shackle form links (#18). `word_forms` was empty
when it ran.

| 54 | 20261010033406 | 041_padarth_glosses | kosh `041_padarth_glosses.sql` |

| 55 | 20261013162934 | 042_aunkar_rule_syncretism | kosh `042_aunkar_rule_syncretism.sql` |

| 56 | 20261013171500 | 043_aunkar_not_a_word_level_rule | kosh `043_aunkar_not_a_word_level_rule.sql` |

Migration 043 follows 042 within the same review (#187). Re-verifying the rest of the Viakaran
findings against the new text layer turned up two more roles for a final aunkar: invariant
adjectives agreeing with feminine and plural nouns (p.356, ਖੁਆਰੁ and ਥਿਰੁ) and ਹੁਕਮੀ ਭਵਿੱਖਤ third
person plural verbs (p.270, -ਨੁ against present -ਨਿ). So 042's remaining "masculine, singular"
claim was still too strong, and the rule is retired as a word-level predictor rather than narrowed
a third time. Registry row only.

| 57 | 20261013232302 | 044_lines_first_letters | kosh `044_lines_first_letters.sql` |

Migration 044 makes first-letter search answer within the anon role's 3s statement timeout: every
query of two or more letters used to time out. It adds `lines.first_letters`, the first code point of
each word in position order, with a `text_pattern_ops` index, and `refresh_line_first_letters()`
(service role only), which the ingest now calls. It also replaces the body of
`search_first_letters(text[], text[], text[], bigint[], int, int, int, int)` with an indexed prefix
match; the signature is unchanged.
- Before applying, ran it in a rolled-back transaction and timed the RPC as anon: 39–721 ms, with line
  counts identical to the old function (ਸਨਕਪ 8, ਸ_ਕ 2,292, ਹ 7,654, ਮਨਮ 30).
- Verified live after applying: 171,880 lines keyed (the 2 lines with no words stay null).
  `search.atthebunga.com/api/search?mode=first_letter` answers in 0.3–0.7 s warm.

Migration 042 corrects AUNKAR_NOM_SG in `grammar_rules` (#187). Sahib Singh states at Gurbani
Viakaran pp.77-78 that final aunkar marks the accusative singular as well as the nominative, and
explains the syncretism historically; the p.62 kaarak table shows the same. The rule had stood
`verified = true` asserting nominative "applied uniformly", because 025 left that call to #27 and
#27 was closed without it. Registry row only: `word_grammar` has held 0 rows for every rule code
since 037. MUKTA_OBL_SG and SIHARI_OBL_SG were re-checked against the same new text layer and are
correct as 025 left them, so they are untouched.

Migration 041 adds `padarth_glosses`, `padarth_gloss_occurrences` and `padarth_case_evidence` for
Sahib Singh's pad-arth split into terms (#165). Applied 2026-10-10 through the MCP; verified after: all
three tables have RLS on and a public read policy, and are empty until
`npm run ingest:padarth:glosses` runs.

Migration 036 is the remove half of 034's add-then-remove: search_number_lines no longer
returns the scalar `char_start`/`char_end`. Verified gurmukhi-search production (f6ec668,
live since 2026-09-23) reads the arrays first; results for value 1 over author/ghar were
identical before and after (713 lines; the double-੧ heading still returns [25, 31]).

**In repo but not in the ledger:** kosh `025_viakaran_rule_corrections.sql` (added
2026-08-06) — applied outside the MCP (dashboard SQL editor), so the server ledger never
recorded it. It IS live (its rule corrections are visible in `grammar_rules`).

Same for kosh `037_archive_inferred_grammar.sql` (applied 2026-10-06 via the dashboard
SQL editor: the MCP's destructive-statement confirmation could not be answered from a
cloud session). Verified live after applying: word_grammar 15,488 rows, all with a
source_code (8,179 mahan_kosh, 7,018 shackle, 291 ss_padarth), 0 rule_derived;
word_grammar_inferred_archive 14,638 (6,459 inherited POS + 8,179 pre-strip snapshots);
word_forms 0 live / 17,715 archived; lexemes 0 live / 5,385 archived; 5,979 automated
doubt flags dismissed. Archive tables have RLS on, no policies, no anon select.

Name-to-file matches above are by name and date and are best-effort for the early
entries; the UNFILED rows' actual SQL would need to be reconstructed from the live
schema if ever required.

## Adding a migration (the loop)

1. Write `supabase/migrations/NNN_name.sql` (next number after the highest here).
2. Apply via MCP `apply_migration` with name `NNN_name`.
3. Append the row above; commit file + ledger row together.
4. If it creates a table: RLS + policies in the same file (CI enforces).

| 58 | 20261014190134 | 045_first_letters_covering_index | kosh `045_first_letters_covering_index.sql` |
| 59 | 20261014201756 | 046_search_order_and_indexes | kosh `046_search_order_and_indexes.sql` |
| 60 | 20261015144521 | 047_fuzzy_search | kosh `047_fuzzy_search.sql` |
| 61 | 20261015145811 | 048_fuzzy_high_letters_only | kosh `048_fuzzy_high_letters_only.sql` |
| 62 | 20261015174022 | 049_definitions_pua_index | kosh `049_definitions_pua_index.sql` |
| 63 | 20261015174347 | 050_definitions_with_pua_definer | kosh `050_definitions_with_pua_definer.sql` |

Migration 045 is a follow-up to 044, which CI caught (PR #193). For a broad query, 044's RPC still
read every matching wide `lines` row from the heap: `ਸ_ਕ` took 5.8 s on a cold cache. 045 adds
`lines_first_letters_cover`, which covers the filter, count and sort columns, and fetches full rows
for the returned page only. The plan is now an index-only scan with 0 heap fetches: `ਹ` (7,654
matches) takes 154 ms cold.
- The first two applies hung, because the MCP holds DROP for a confirmation, as with 037. So the
  file adds the new index and leaves the old one. The old index was dropped from the dashboard SQL
  editor on 2026-10-16 (see below).

Migration 046 reorders the corpora to SGGS, Dasam, Sarbloh, Bhai Gurdas, and adds `lines_gurmukhi_trgm`
(for gurmukhi-search's Contains search) and `words_frequency_rank` (for the Dictionary feed) (PR #195). It
was dry-run against live data in an aborted `DO` block (~12 s to apply) before being applied. After the
apply: ranks are sggs=0, dasam=10, sarbloh=20, bhai_gurdas=30, and as anon, `ਸਤਿਗੁਰ ਪ੍ਰਸਾਦਿ`
(SGGS + Dasam, first 21) takes 5 ms through the trigram index. It used to be a 0.7-4 s full scan.

Migration 047 adds fuzzy search levels for gurmukhi-search: `fuzzy_fold(text, level)`, 7 expression indexes on
the folded `lines.gurmukhi`, `lines.first_letters` and `words.gurmukhi`, and 3 RPCs (`search_lines_fuzzy`,
`search_first_letters_fuzzy`, `search_words_fuzzy`). It is additive only. It was dry-run against live data in an
aborted `DO` block (~20 s to apply), with fold assertions and timings as anon: Low/Medium Contains 8-190 ms,
High Contains 9-246 ms, First Letter 2-76 ms (Low/Medium) and ~800 ms (High), Dictionary 5-272 ms.

Migration 048 fixes 047's High level, whose one-letter wildcard (LIKE `_`) also matched a space or a vowel sign:
ਵਾਹਗੁਰੂ found "ਪਾਵ ਗੁਰੂ" on the live preview. The wildcard is now letter-only (a regex recheck on top of 047's
LIKE candidates). After applying, ਵਾਹਗੁਰੂ at High returns 14 lines with 0 cross-word matches. Timings as anon:
High Contains 0.25-1.2 s, High Dictionary 11-256 ms.

Migration 051 folds vowel carriers in First Letter search (#198): `lines.first_letters` stores ੲ for ਇ ਈ ਏ, ੳ for ਉ ਊ ਓ
and ਅ for ਆ ਐ ਔ, and both RPCs fold the query the same way. It also adds covering versions of 047's fuzzy first-letter
indexes and drops the unreachable multi-code-point branch (#199). It was dry-run against live data in an aborted `DO`
block before being applied: ੲ, ਇ and ਏ each 4,870 lines, ੳ 2,085, ਅ/ਆ 13,644; unchanged ਸਨਕਪ 8, ਸ_ਕ 2,292, ਹ 7,654,
ੴਸਨਕਪ 31; 0 unfolded rows left. Timings as postgres: 7-220 ms exact, 8-25 ms Low/Medium, ~870 ms High.
- The superseded `lines_first_letters_fold1`/`_fold2` were dropped from the dashboard SQL editor on 2026-10-16.

Migration 052 adds gurmukhi-search's count and Dictionary-filter RPCs: `count_number_roles` (role counts scoped to the
filters), `count_lines_fuzzy` (capped fuzzy Contains total), and `word_corpus_writer_stats` +
`search_words_filtered` (#204). The table is named apart from 008's `word_writer_stats` matview, which has no scripture
column. Dry-run in an aborted `DO` block, then applied: 149,302 stats rows summing to all 1,108,716 occurrences;
number ੧ in Dasam only reads author 0, ghar 0, other 2, verse 563 (84 ms); fuzzy counts 75-282 ms; filtered word
lookups 10-103 ms. Checked as anon after applying.

Migration 053 rewrites 052's `count_number_roles` so the facet filters are a per-numeral EXISTS (skipped when no filter
is set) instead of a join the planner served by hashing all of `lines`: unfiltered ੧ went from 2.1 s as anon (a CI
timeout under load, PR #210) to 47 ms, with identical counts. Dry-run in an aborted `DO` block, then applied.

Migration 055 appends `id` to the reading-order sort of the six line-search RPCs (gurmukhi-search#46). `line_no` is the
printed line, so `(corpus_rank, ang, line_no)` tied and offset pages could repeat or skip lines. `(ang, line_no, id)`
matches `verse_id` order for every line of every scripture (0 out of place), and `id` is already in the covering
indexes. The migration edits the deployed definitions in place, touching `order by` clauses only; a first draft also
matched a select list, and the dry run caught it. Dry-run in an aborted `DO` block, then applied: First Letter ਹ, number
੧ (verse markers) and fuzzy ਹਰਿ each return the same 200 lines paged by 20 as in one read, in verse order. Counts unchanged
as anon (ੲ 4,870; ੧ author 624).

Migration 057 adds the `ssk_en` translation source: Dr Sant Singh Khalsa's English, verbatim from BaniDB's
`translation.en.ssk`. `lines.translation_en` is BaniDB's `bdb` revision of it, which differs on ~13% of lines. Applied;
the rows themselves come from `npm run ingest:translations -- --start=1 --end=1430 --sources=ssk_en`, which needs the
service-role key. Ran 2026-10-16: 60,173 rows.

**Done 2026-10-16** from the dashboard SQL editor (the MCP still holds DROP for a confirmation that times out). The
planner uses the covering replacements (checked with EXPLAIN before and after):

```sql
drop index if exists lines_first_letters;        -- 044, superseded by lines_first_letters_cover (045)
drop index if exists lines_first_letters_fold1;  -- 047, superseded by lines_first_letters_fold1_cover (051)
drop index if exists lines_first_letters_fold2;  -- 047, superseded by lines_first_letters_fold2_cover (051)
```
Migration 058 adds `lines.vishraam` (jsonb: per set, word index → `v`/`y`) and `set_lines_vishraam(jsonb)`, the
service-role writer the ingest uses (#217). Applied. The marks come from `npm run ingest:vishraam` (all of SGGS) and
`npm run ingest:vishraam -- --source=dasam_banidb_v2`, which need the service-role key. Ran 2026-10-16: 57,816 SGGS
lines and 215 Dasam lines carry marks (BaniDB has few for Dasam, none for Bhai Gurdas).

Migration 059 adds `banis` and `passages`: each BaniDB bani's paragraphs matched to our lines by page and text (#220).
Applied. Japji (bani 2, 43 passages) is seeded. The rest come from `npm run ingest:passages`, which needs the
service-role key; `-- --dry-run` reports matches without writing. Ran 2026-10-16: 6,664 passages across 104 banis,
4 bani verses unmatched (BaniDB spelling variants).


Migration 060 gives every Sri Sarbloh Granth line a `shabad_id`, one per chhand run or titled section (#233), from
`sarbloh_section_indexes`, the SQL twin of `pipeline/sarbloh/lines.ts` `sectionIndexes`. Applied 2026-10-16: 1,564
sections, ids 900001-901564, each with a `shabads` row (`ang_start` only). `id`, `verse_id`, `line_no` and `ang` are
unchanged (checksum of the 36,000 rows the same before and after); no Sarbloh line has a null `shabad_id`.

Migration 061 attributes every Sri Sarbloh Granth shabad to Guru Gobind Singh Ji (writer_id 47, as Dasam Bani) (#205).
This is an internal decision (maintainer, 2026-10-17), not a sourced attribution. Likewise the Sarbloh shabad ids
(900001+, 060) are assigned internally and could clash with a source loaded later; check the range first. Applied
2026-10-17: 1,564 shabads; `word_writer_stats` refreshed (16,365 → 137,468 rows: it had not been refreshed since the
Dasam and Bhai Gurdas loads) and `word_corpus_writer_stats` rebuilt (no Sarbloh rows left without a writer).

Migration 062 fixes two Sarbloh section rules (#236): a numbered ਬਿਸਨੁਪਦ / ਅਥ heading (ਬਿਸਨੁਪਦ ਛੰਦ ਕਾਲੰਕਾ ਘਰ ॥੧॥)
is a title, and a ਬਿਸਨੁਪਦ heading is matched by its spellings, not by any word starting ਬਿਸਨ (ਬਿਸਨੁ, Vishnu). 1,564
sections became 1,559, renumbered 900001-901559 (maintainer decision: contiguous, as build:sarbloh assigns; cached
Sarbloh shabad_ids are stale). Applied 2026-10-18. The 35,723 moved lines were updated in four batches by line_no
first (one statement over all of them outran the MCP's 60 s), then the migration ran with nothing left to move.
`id`, `verse_id`, `line_no`, `ang` unchanged (same checksum); the rows match the new function exactly.

**Done 2026-10-18** from the dashboard SQL editor (the MCP holds DELETE for a confirmation that times out): removed
the five retired shabads rows, 901560-901564, which no line used. 1,559 Sarbloh shabads remain, one per section:

```sql
delete from shabads sh where sh.id >= 900001
   and not exists (select 1 from lines l where l.shabad_id = sh.id);
```

Migration 063 adds the `nand_lal_ghazals` source (Bhai Nand Lal's Ghazals, `source_fk` 6), 63 `shabads` rows on
BaniDB's ShabadIDs (30000-30062, minus BaniDB's duplicate 30060, plus 910061 for ghazal 61), and reading order 40
(`pipeline/nand-lal/README.md`). Applied 2026-10-18. **Ledger name `061_nand_lal_ghazals_source`**: it was applied
from its branch before main's 061/062 (Sarbloh) were merged in, then renumbered 063 in the repo; the SQL is the
same. The lines were loaded and refreshed the same day: 722 lines, 5,099 occurrences, 1,802 words, checksums
matching the build. The new words' `ipa_display` and `search_fold` were filled from `lib/pronounce` and
`lib/gurmukhi-fold` (what `npm run pronounce` / `npm run searchfold` write), checksum-matched.
**After any `corpus_rank` SET EXPRESSION, run `vacuum (analyze) lines`.** The rewrite resets the visibility map,
so `search_first_letters` falls back from the covering index (045) to heap reads and `ਸ_ਕ` outran the anon 3 s
timeout until the vacuum (run 2026-10-18).

Migration 064 keeps Sarbloh refrains and closing labels with their piece (#236): ॥੧॥ refrain lines closed by a ਰਹਾਉ no
longer start a section (unless the piece opens SGGS-style, ॥੧॥, ਰਹਾਉ, ॥੨॥), and a lone ॥੧॥ label or colophon stays with
the piece it closes. 1,559 sections became 1,425 (36 of the short ones listed for #236, and 98 longer ones a mid-run
refrain had split off), renumbered 900001-901425. Applied 2026-10-18, lines moved in four batches first as for 062; `id`,
`verse_id`, `line_no`, `ang` unchanged (same checksum); the rows match the new function exactly. **Ledger name
`063_sarbloh_refrains`**: it was applied before main's 063 (ghazals, above) was merged in, then renumbered 064 in the
repo; the SQL is the same.

Decisions (maintainer, 2026-10-18), on best judgment and open to revision; either way the effect on readers is small:
fix the refrain and closing-label splits; keep the ਬਿਸਨੁਪਦ ਛੰਤ ਰਾਮਾ pieces of pages 460-470 split at each ਸਲੋਕ and ਛੰਤ, with
each ਰਹਾਉ refrain joined to the ਛੰਤ it closes.

**Done 2026-10-19** from the dashboard SQL editor (the MCP holds DELETE for a confirmation that times out): removed
the 134 retired shabads rows, 901426-901559, which no line used. 1,425 Sarbloh shabads remain, one per section:

```sql
delete from shabads sh where sh.id >= 900001
   and not exists (select 1 from lines l where l.shabad_id = sh.id);
```

| 66 | 20261019220132 | 065_data_driven_sources | kosh `065_data_driven_sources.sql` |

Migration 065 makes sources describe themselves (#243): `sources` gains `slug`, `kind`, `tier`, `rank`, `page_unit`,
`searched_by_default`, `author` and `external_refs` (BaniDB SourceID, ShabadOS code); `lines.corpus_rank` drops its
generated CASE and is set from `sources.rank` by trigger (a new source is one insert; changing a rank re-ranks its
lines); `shabads.source_fk` references `sources` instead of `dict_sources`, backfilled from lines (SGGS 5,542,
Bhai Gurdas 911, Dasam 5,422, Sarbloh 1,425, Nand Lal 63). Tested first on the PGlite replay (`tests/db/sources.test.ts`),
dry-run in an aborted `DO` block, then applied 2026-10-19. DROP EXPRESSION rewrote nothing: per-source ranks and
counts unchanged, and 15 ordered-result fingerprints of the search RPCs, counts and feed order (taken before and after)
are identical. Timings as postgres, warm: First Letter ਸ_ਕ 18 ms, Contains 13 ms, fuzzy High ~660 ms, word-ids ਹਰਿ
at offset 2000 50 ms. The triggers were checked live in an aborted `DO` block (a probe source at rank 35 sorted after
Bhai Gurdas, and re-ranked to 5 it sorted after SGGS).

| 67 | 20261021030235 | 066_contains_search | kosh `066_contains_search.sql` |

Migration 066 adds `search_lines_contains` / `count_lines_contains` for gurmukhi-search's exact Contains, matching the
line and the query after `normalize(…, NFD)` (expression trigram index `lines_gurmukhi_nfd_trgm`), so a nukta letter
matches whether stored ready-made or as letter + ਼, and a query with no trigram (਼, ੍, "੍ ") uses strpos instead of a
full trigram index scan that ran past the anon 3 s timeout. Tested first on the PGlite replay
(`tests/db/contains-search.test.ts`), applied 2026-10-21. Checked live as anon: ਼ 7,644 lines, ੍ 45,032, "੍ " 1
(ਜਨਿੰਦ਼੍), ਸ਼ in either form 5,301; plain words unchanged (ਸਤਿ 3,607, ਸਬਦ 3,364, same as the old `like`). Timings, warm:
਼ ~1.0 s rows / 0.9 s count (the slowest), ੍ 0.6 s / 0.4 s, "੍ " 0.3 s, ਸਤਿ 50 ms, ਹਰਿ 130 ms.

| 68 | — | 067_contains_mark_prefilter | kosh `067_contains_mark_prefilter.sql`, first version (prefilter ANDed) |
| 69 | — | 067b_contains_prefilter_case | kosh `067_contains_mark_prefilter.sql`, final version (prefilter in CASE) |

Migration 067 redefines `contains_condition` (066) so a query with no trigram checks the raw text first and only
normalizes lines that pass. It was applied twice on 2026-10-21. The first version ANDed the prefilter, which the
planner evaluated after `normalize()` (its cost estimate rated normalize cheaper), so it saved little. The second,
`067b`, wraps it in CASE to force the order; the repo file is that final version. Both applies returned results
identical to 066 for 9 queries (count and md5 of every matching id: ਼, ੍, "੍ ", ਸ਼ in both forms, ਸ, ਲ਼, ਼ਾ, ਸਤਿ).
Timings as anon, warm: ਼ 1.0 s → 0.17 s rows / 0.9 s → 0.2 s count; ਸ਼ 0.15 / 0.2 s; ੍ count ~0.4 s (45k lines
contain a halant, so the prefilter can't skip much there); ਸਤਿ unchanged at 46 ms. Motivation: four 066 calls
for ਼ passed the anon 3 s timeout during a busy minute after the 066 deploy (17:05 UTC).

**068_sarbloh_doubled_halant** — run 2026-10-21 from the dashboard SQL editor, so there is no ledger row: the MCP's
`apply_migration` holds the DELETE for a confirmation that never reached the maintainer and timed out (three tries,
each rolled back). Kosh `068_sarbloh_doubled_halant.sql`, as in the repo. Four Sarbloh half-lines had a halant typed
twice (lines 169421, 169439, 171115, 173273). Checked after: no line or word holds a doubled halant; ਛਤ੍ਰ (72052)
211 → 212 occurrences (Sarbloh 77 → 78 in both stats tables) and ਸਸਤ੍ਨ (898002) 2 → 3, their misspellings 908120
and 921408 deleted; 925959 renamed ਨ੍ਪਬਰ and 891466 ਪ੍ਸਾਦਿ (fold ਪ੍ਸਾਦ); each line's words read back in order.
`pipeline/sarbloh/lines.ts` cleanText now collapses doubled halants, so a rebuild keeps them fixed.

**070_private_corpora** — run 2026-10-22 from the dashboard SQL editor, so there is no ledger row: the MCP's
`apply_migration` timed out after 60 s and rolled back (nothing applied), as for 068. Kosh `070_private_corpora.sql`, as
in the repo. Checked after: all 172,604 lines `is_public`; the five corpora have public `source_rights` rows; 10 of the
13 line-search functions are now security definer (the other three don't read `lines` themselves); anon can no longer
execute `refresh_computed_stats`.

**071_gur_sobha_source** — applied 2026-10-22 with the MCP's `apply_migration` (ledger row `071_gur_sobha_source`). Kosh
`071_gur_sobha_source.sql`, as in the repo. Checked after: `gur_sobha_iss` is source 7 (pinned; the sequence would have
given 8), curator-only and absent from `public_source_codes`, with its 483 shabads (920001-920483). Its lines are not
loaded yet.

**072_health_stats_fast** — applied 2026-10-22 with the MCP's `apply_migration`, twice (ledger rows `072_health_stats_fast`
and `072b_health_stats_fast`); the repo file is the second version. After 070, `/api/health` returned 500: 070's
`health_stats` filtered on `lines.is_public`, which no index answers, and ran ~29 s (`count(distinct ang)` alone 5.8 s,
an index-only scan on `lines_ang` before). 072 counts over all lines and subtracts the private ones (partial index
`lines_private`). The first version reached the private occurrences and translations through `line_id in (…)`, which
scanned every row; the second starts from `lines`. `analyze lines` was then run by hand: `is_public` had no statistics,
so the planner expected many private lines and merge-joined over all of `lines` (9 s). After: `/api/health` 200, same
totals (172,604 lines, 1,430 angs, 1,113,815 occurrences). The function still takes ~14 s on its other, older parts
(definitions and line_translations scans), inside its 20 s limit.

**Gur Sobha lines (source 7)** — loaded 2026-10-23 with `npm run load:gur-sobha` (REST, service key) from the ISS 2014
PDF on Drive; no migration. The build printed 3,708 lines, 483 shabads, 20 chapters, 23,736 tokens, 4,789 distinct, as
expected. All four refreshes ran in the loader without a timeout; none was run by hand. Checked after: 3,708 lines with
`source_fk = 7`, none `is_public`; 23,736 occurrences over 4,789 distinct words (786 of them new: words 88,972 →
89,758); as anon, 0 lines of source 7. `npm run pronounce` and `npm run searchfold` then ran over all words: no word
lacks `ipa_display`; three lack `search_fold`, all older bare vowel-sign rows (ੀ ੁ ਿ), none from Gur Sobha.

**073_dasam_banidb_corrections** — run 2026-10-23 from the dashboard SQL editor, so there is no ledger row: the MCP's
`apply_migration` and `execute_sql` both held it for a confirmation that never reached the maintainer and timed out
(nothing applied), as for 068. Kosh `073_dasam_banidb_corrections.sql`, as in the repo. Twelve Dasam lines BaniDB
mistyped (verses 80315, 80317, 130072, 130073, 130077, 130080, 130171, 130263, 130265, 130267, 141915, 402922),
checked against the 1912 Sodhak print, the Hazur Sahib larivaar and a 19th-c. Ugardanti pothi
(`pipeline/sggs/corrections.ts`). Checked after: all twelve lines read as corrected, words back in order; 130072 gained
ਨ (5 → 6 occurrences, first letters ਤਹਬਨਕਜ); misspellings ਮੁਿਹ, ਘੇਿਰ, ਤਾਂੈ, ਬੁੱਿਧ, ਜੋਉੂ deleted; frequencies ਭਾਗ
281 → 274, ਭਾਂਗ 2 → 9, ਮੁਹਿ, ਘੇਰਿ, ਤੈਂ, ਨ, ਕਹਾ, ਬੁੱਧਿ, ਜੋਊ +1, ਕਹ −1, both stats tables matching occurrences;
the numerals in 130073 and 130171 still span ੩੬ and ੫੮. `bigrams` and `collocations` catch up on the next
`pipeline/compute` run.

**074_trim_indexes** — run 2026-10-24 from the dashboard SQL editor, so there is no ledger row: the MCP holds any
statement containing DROP for a confirmation that times out (nothing applied), as for 068. Kosh `074_trim_indexes.sql`,
as in the repo (PR #305). Drops `lines_first_letters_cover`, `word_occurrences_word_id`, `line_translations_line_id`,
`words_phonetic_ipa_trgm` and `word_occurrences_position_word`; the PR has the before/after plans (hypopg-hidden, in
rolled-back transactions). Checked after: none of the five remain; `lines_first_letters_cover_public`,
`word_occurrences_unique`, `word_occurrences_line_id`, `line_translations_line_id_source_code_key` and
`words_gurmukhi_fold1`/`_fold2`/`_fold2_trgm` do. Database 927 → 861 MB.

**075_health_stats_cache** — applied 2026-10-24 with the MCP's `apply_migration`, under the name it had then (ledger
row `20261024171652 073_health_stats_cache`). Kosh `075_health_stats_cache.sql`, as in the repo; it was
`073_health_stats_cache.sql` until `073_dasam_banidb_corrections` (#304) and `074_trim_indexes` were found to have taken
073 and 074 first, so the file was renumbered to keep one migration per number. The two don't touch the same objects,
so the replay's order (dasam 073, 074, then this) gives the same schema as production's. `health_stats()` had taken
17.2 s (explain analyze, 2026-10-23); every total only an ingest changes is now computed by `refresh_health_stats()`
into `health_stats_cache`, and `health_stats()` counts only open flags and the source registries live. Checked after:
`health_stats()` 5.6 ms warm (497 ms on its first call); cache totals unchanged at 172,604 lines and 1,430 angs, with
1,113,816 occurrences; anon and authenticated can execute neither `refresh_health_stats` nor `refresh_computed_stats`
and cannot read `health_stats_cache` (RLS on); `/api/health` 200 with "Totals last recomputed: 2 min ago".

**076_dasam_kanna_nasal** — run 2026-10-28 on the self-hosted server (`selfhost/`, production since the cutover)
with `docker compose exec -T db psql -v ON_ERROR_STOP=1 -1 -U postgres -d postgres < 076_dasam_kanna_nasal.sql`, in
one transaction; Supabase, frozen at cutover, still has BaniDB's text. Kosh `076_dasam_kanna_nasal.sql`, as in the
repo (#316). 121 Dasam lines where BaniDB has ਾਂ after a vowel sign, read in the Hazur Sahib print and 39 of them in
the 1912 print (`pipeline/sggs/nasal-corrections.ts`, evidence and decisions on #312); seven more wait on a
tippi-or-bindi review. psql reported 121 lines matched, 63 new words inserted, 826 occurrences rebuilt, 659 word
counts updated. Checked after through the API: all 121 lines and transliterations read as corrected; the 91 corrected
spellings are words with a `search_fold` and a frequency above 0; 89 of the 91 misspellings deleted (ਕਿਨੋ and ਵਜ਼ਾ
stay, used elsewhere); the only Dasam lines left with ਾਂ after a vowel sign are the seven held back (106630, 113536,
118908, 118909, 126247, 126395, 129315). The 63 new words have no `ipa_display` until `npm run pronounce` runs.
`bigrams` and `collocations` catch up on the next `pipeline/compute` run.
