/**
 * Auto-flagging pass (P4) over word_grammar: raises a system flag for every
 * reading that carries genuine "doubt" or "conflict", so a human reviews
 * exactly the readings worth reviewing instead of the whole corpus.
 *
 *   - doubt:    a rule_derived row whose rule is still grammar_rules.verified=false
 *               (currently SIHARI_OBL_SG, MUKTA_OBL_SG). Targets that specific
 *               word_grammar row.
 *   - conflict: buildGrammarView finds cross-source disagreement on some
 *               attribute for the word (the same signal the word page and
 *               /health already surface). Targets the word generally, matching
 *               how the interactive grammar FlagForm targets conflicts.
 *
 * Idempotent: skips a (word, target, flag_type) combination that already has
 * an open flag from this same reporter, so re-running after a future ingest
 * doesn't pile up duplicates.
 *
 * Usage (from gurmukhi-kosh project root):
 *   npm run ingest:grammar:autoflag
 *
 * Requires in .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "../shared/db";
import { buildGrammarView } from "../../lib/grammar-view";
import type { WordGrammarWithRule } from "../../lib/supabase";

const SYSTEM_REPORTER = "Rule engine (automated)";

async function fetchAllGrammarRows(db: SupabaseClient): Promise<WordGrammarWithRule[]> {
  const rows: WordGrammarWithRule[] = [];
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await db
      .from("word_grammar")
      .select("*, grammar_rules(*)")
      .order("id", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`fetchAllGrammarRows: ${error.message}`);
    const batch = (data ?? []) as unknown as WordGrammarWithRule[];
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }
  return rows;
}

async function hasOpenAutoFlag(
  db: SupabaseClient,
  wordId: number,
  targetTable: string | null,
  targetId: number | null,
  flagType: string
): Promise<boolean> {
  let query = db
    .from("flags")
    .select("id")
    .eq("word_id", wordId)
    .eq("status", "open")
    .eq("reporter_name", SYSTEM_REPORTER)
    .eq("flag_type", flagType);
  query = targetTable ? query.eq("target_table", targetTable) : query.is("target_table", null);
  query = targetId != null ? query.eq("target_id", targetId) : query.is("target_id", null);
  const { data, error } = await query.limit(1);
  if (error) throw new Error(`hasOpenAutoFlag: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

async function main() {
  const db = supabaseAdmin();

  const rows = await fetchAllGrammarRows(db);
  console.log(`Fetched ${rows.length} word_grammar rows`);

  // --- Doubt: rule_derived rows whose rule isn't yet verified ---
  let doubtCreated = 0;
  let doubtSkipped = 0;
  for (const row of rows) {
    if (row.provenance !== "rule_derived" || !row.rule_code) continue;
    const rule = row.grammar_rules;
    if (!rule || rule.verified) continue;

    if (await hasOpenAutoFlag(db, row.word_id, "word_grammar", row.id, "unclear")) {
      doubtSkipped++;
      continue;
    }
    const { error } = await db.from("flags").insert({
      word_id: row.word_id,
      target_table: "word_grammar",
      target_id: row.id,
      flag_type: "unclear",
      message: `Auto-flagged: this reading comes from an unverified rule (${rule.title}). ${rule.explanation}`,
      reporter_name: SYSTEM_REPORTER,
    });
    if (error) {
      console.error(`doubt flag insert error (word_grammar ${row.id}):`, error.message);
      continue;
    }
    doubtCreated++;
  }
  console.log(`Doubt flags: ${doubtCreated} created, ${doubtSkipped} already open`);

  // --- Conflict: cross-source disagreement on some attribute, per word ---
  const byWord = new Map<number, WordGrammarWithRule[]>();
  for (const row of rows) {
    const list = byWord.get(row.word_id) ?? [];
    list.push(row);
    byWord.set(row.word_id, list);
  }

  let conflictCreated = 0;
  let conflictSkipped = 0;
  for (const [wordId, wordRows] of byWord) {
    const view = buildGrammarView(wordRows);
    const conflicting = view.filter((a) => a.conflict);
    if (conflicting.length === 0) continue;

    if (await hasOpenAutoFlag(db, wordId, null, null, "incorrect")) {
      conflictSkipped++;
      continue;
    }
    const details = conflicting
      .map((a) => `${a.label}: ${a.readings.map((r) => r.value).join(" vs. ")}`)
      .join("; ");
    const { error } = await db.from("flags").insert({
      word_id: wordId,
      target_table: null,
      target_id: null,
      flag_type: "incorrect",
      message: `Auto-flagged: cross-source grammar conflict — ${details}.`,
      reporter_name: SYSTEM_REPORTER,
    });
    if (error) {
      console.error(`conflict flag insert error (word ${wordId}):`, error.message);
      continue;
    }
    conflictCreated++;
  }
  console.log(`Conflict flags: ${conflictCreated} created, ${conflictSkipped} already open`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
