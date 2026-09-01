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
   this database. They are records of what ran, not scripts to re-run.
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

**In repo but not in the ledger:** kosh `025_viakaran_rule_corrections.sql` (added
2026-08-06) — applied outside the MCP (dashboard SQL editor), so the server ledger never
recorded it. It IS live (its rule corrections are visible in `grammar_rules`).

Name-to-file matches above are by name and date and are best-effort for the early
entries; the UNFILED rows' actual SQL would need to be reconstructed from the live
schema if ever required.

## Adding a migration (the loop)

1. Write `supabase/migrations/NNN_name.sql` (next number after the highest here).
2. Apply via MCP `apply_migration` with name `NNN_name`.
3. Append the row above; commit file + ledger row together.
4. If it creates a table: RLS + policies in the same file (CI enforces).
