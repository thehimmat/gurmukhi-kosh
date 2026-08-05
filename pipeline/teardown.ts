/**
 * One-command teardown for a single dictionary source.
 *
 * The sourcing posture for every rights-encumbered source (SikhRI, Shackle,
 * DSAL) promises removal "promptly and completely" on request. That promise is
 * only credible if removal is one vetted command rather than hand-written SQL
 * against production, which is what this script is for.
 *
 * Safe by default: prints per-table row counts and changes nothing unless
 * --confirm is passed.
 *
 *   npx tsx pipeline/teardown.ts --source=sikhri            # dry run
 *   npx tsx pipeline/teardown.ts --source=sikhri --confirm  # actually delete
 *
 * Content tables are scoped either by dict_sources.id or by a source_code text
 * column. Lookup tables (sigla, mappings) are scoped by source_code too and are
 * removed as well, since a takedown means everything derived from the source.
 *
 * NOT deleted: rows in `words`. Off-corpus lemmas a source contributed carry
 * words.origin_source, but `words` is referenced by occurrences, flags, audio
 * and more, so those are reported for a human decision instead of cascaded.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { supabaseAdmin } from "./shared/db";
import { getArg } from "./shared/utils";

// Tables keyed by the numeric dict_sources.id.
const BY_DICT_SOURCE_ID = ["definitions", "dict_examples"] as const;

// Tables keyed by the text source code.
const BY_SOURCE_CODE = [
  "word_grammar",
  "etymology",
  "word_forms",
  "lexeme_citations",
  "lexeme_relations",
  "citation_sigla",
  "dict_mappings",
  "pos_mappings",
] as const;

async function main() {
  const sourceCode = getArg("source");
  const confirm = getArg("confirm") !== undefined;

  if (!sourceCode) {
    console.error("Usage: npx tsx pipeline/teardown.ts --source=<code> [--confirm]");
    process.exit(1);
  }

  const db = supabaseAdmin();

  const { data: src, error: srcErr } = await db
    .from("dict_sources")
    .select("id, code, name")
    .eq("code", sourceCode)
    .maybeSingle();

  if (srcErr) throw new Error(`dict_sources lookup failed: ${srcErr.message}`);
  if (!src) {
    console.error(`No dict_sources row with code='${sourceCode}'.`);
    process.exit(1);
  }

  console.log(`\nSource: ${src.name}  (code=${src.code}, id=${src.id})`);
  console.log(confirm ? "Mode:   DELETE (--confirm given)\n" : "Mode:   dry run (pass --confirm to delete)\n");

  const counts: Array<[string, number]> = [];

  for (const table of BY_DICT_SOURCE_ID) {
    const { count, error } = await db
      .from(table)
      .select("*", { count: "exact", head: true })
      .eq("dict_source_id", src.id);
    if (error) throw new Error(`${table} count failed: ${error.message}`);
    counts.push([table, count ?? 0]);
  }

  for (const table of BY_SOURCE_CODE) {
    const { count, error } = await db
      .from(table)
      .select("*", { count: "exact", head: true })
      .eq("source_code", sourceCode);
    if (error) throw new Error(`${table} count failed: ${error.message}`);
    counts.push([table, count ?? 0]);
  }

  const width = Math.max(...counts.map(([t]) => t.length));
  for (const [table, n] of counts) {
    console.log(`  ${table.padEnd(width)}  ${n}`);
  }
  const total = counts.reduce((sum, [, n]) => sum + n, 0);
  console.log(`  ${"TOTAL".padEnd(width)}  ${total}`);

  // Reported, never auto-deleted (see header note).
  const { count: originWords } = await db
    .from("words")
    .select("*", { count: "exact", head: true })
    .eq("origin_source", sourceCode);
  if (originWords) {
    console.log(
      `\n  NOTE: ${originWords} rows in \`words\` have origin_source='${sourceCode}'.` +
        `\n  These are NOT deleted — \`words\` is referenced by occurrences, flags and audio.` +
        `\n  Decide separately whether off-corpus lemmas should also go.`
    );
  }

  if (!confirm) {
    console.log(`\nNothing changed. Re-run with --confirm to delete the ${total} rows above.\n`);
    return;
  }

  if (total === 0) {
    console.log("\nNothing to delete.\n");
    return;
  }

  console.log("\nDeleting...");
  for (const table of BY_DICT_SOURCE_ID) {
    const { error } = await db.from(table).delete().eq("dict_source_id", src.id);
    if (error) throw new Error(`${table} delete failed: ${error.message}`);
  }
  for (const table of BY_SOURCE_CODE) {
    const { error } = await db.from(table).delete().eq("source_code", sourceCode);
    if (error) throw new Error(`${table} delete failed: ${error.message}`);
  }

  console.log(`Deleted ${total} rows for '${sourceCode}'.`);
  console.log(
    `The dict_sources row itself is kept, so re-running the source's ingest restores everything.\n`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
