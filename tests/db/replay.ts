/**
 * An in-process Postgres (PGlite) with every migration that shaped the shared Supabase project
 * replayed in server-ledger order (supabase/APPLIED.md), for testing schema changes without the
 * live database. The migrated database is built once per test worker; freshDb() hands out clones.
 */
import { readdirSync, readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";

const KOSH = "supabase/migrations";
const SEARCH = "supabase/migrations-imported/gurmukhi-search";
const VOICE = "supabase/migrations-imported/gurmukhi-voice-search";
const UNFILED = "supabase/migrations-imported/unfiled";
const DASHBOARD = "supabase/migrations-imported/dashboard";

// Migrations that ran between this repo's, keyed by the repo migration they ran just before
// (supabase/APPLIED.md), including statements run by hand in the dashboard SQL editor. New
// migrations need no entry: they replay in number order at the end.
const BEFORE: Record<string, string[]> = {
  "002_word_features.sql": [`${SEARCH}/001_search_functions.sql`],
  "003_provenance_review.sql": [
    `${VOICE}/001_add_phonetic_ipa.sql`,
    `${UNFILED}/20260603152332_bulk_update_phonetic_ipa_fn.sql`,
    `${UNFILED}/20260603181130_improve_phonetic_search_word_similarity.sql`,
    `${UNFILED}/20260603181237_fix_phonetic_search_explicit_threshold.sql`,
  ],
  "008_writer_stats_name.sql": [`${SEARCH}/002_word_and_letterset_functions.sql`],
  "009_grammar_rules.sql": [
    `${SEARCH}/003_optimize_lines_by_word_ids.sql`,
    `${UNFILED}/20260629040129_lines_by_word_ids_dynamic_plan.sql`,
    `${SEARCH}/004_words_index.sql`,
  ],
  "014_flags.sql": [`${UNFILED}/20260701031419_health_stats_timeout.sql`],
  "019_scoped_delete_indexes.sql": [`${UNFILED}/20260722131423_018b_etymology_source_code.sql`],
  "032_number_occurrences.sql": [
    `${SEARCH}/005_corpus_ordered_search.sql`,
    `${SEARCH}/006_multi_select_filters.sql`,
    `${SEARCH}/007_single_value_rpc_compat.sql`,
  ],
  "058_line_vishraam.sql": [`${DASHBOARD}/2026-10-16_drop_superseded_first_letters_indexes.sql`],
};

/** Every migration file, repo-relative, in the order the server applied them. */
export function replayOrder(): string[] {
  const kosh = readdirSync(KOSH).filter((f) => f.endsWith(".sql")).sort();
  return kosh.flatMap((f) => [...(BEFORE[f] ?? []), `${KOSH}/${f}`]);
}

const BOOTSTRAP = "tests/db/supabase-bootstrap.sql";
// Seeded right after 001, where production's add_sources_table seeded it.
const AFTER_001 = "tests/db/sggs-source.sql";

async function migrate(): Promise<PGlite> {
  const db = await PGlite.create({ extensions: { pg_trgm } });
  const files = [BOOTSTRAP, ...replayOrder().flatMap((f) => (f.endsWith("/001_schema.sql") ? [f, AFTER_001] : [f]))];
  for (const file of files) {
    try {
      await db.exec(readFileSync(file, "utf8"));
    } catch (e) {
      throw new Error(`replaying ${file}: ${(e as Error).message}`);
    }
  }
  return db;
}

let template: Promise<PGlite> | undefined;

/** A migrated database of its own, with no corpus rows beyond what migrations seed. */
export async function freshDb(): Promise<PGlite> {
  template ??= migrate();
  return (await template).clone() as Promise<PGlite>;
}
