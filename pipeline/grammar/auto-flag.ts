/**
 * Auto-flagging pass (P4) over word_grammar: raises a system flag for every
 * word whose sources disagree, so a human reviews exactly the readings worth
 * reviewing instead of the whole corpus.
 *
 *   - conflict: buildGrammarView finds cross-source disagreement on some
 *               attribute for the word (the same signal the word page and
 *               /health already surface). Targets the word generally, matching
 *               how the interactive grammar FlagForm targets conflicts.
 *
 * Idempotent: skips a word that already has an open conflict flag from this
 * same reporter, so re-running after a future ingest doesn't pile up duplicates.
 *
 * Reconciling: an open conflict flag on a word that no longer conflicts is
 * dismissed with a note (e.g. after #29 normalized Shackle POS strings, most
 * "conflicts" were string artifacts). So is any remaining "doubt" flag: those
 * targeted readings from the retired Viakaran ending rules, which no longer
 * exist (migration 037 archived them). Only this reporter's still-open flags
 * are touched; human flags and reviewed flags never are.
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
import { fetchAllRows } from "../../lib/fetch-all-rows";
import { fetchPosMap } from "../../lib/word-data";
import type { WordGrammarWithRule } from "../../lib/supabase";

const SYSTEM_REPORTER = "Rule engine (automated)";

async function fetchAllGrammarRows(db: SupabaseClient): Promise<WordGrammarWithRule[]> {
  return fetchAllRows<WordGrammarWithRule>("fetchAllGrammarRows", () =>
    db.from("word_grammar").select("*, grammar_rules(*)").order("id", { ascending: true })
  );
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

  const [rows, posMap] = await Promise.all([fetchAllGrammarRows(db), fetchPosMap(db)]);
  console.log(`Fetched ${rows.length} word_grammar rows`);

  // --- Conflict: cross-source disagreement on some attribute, per word ---
  const byWord = new Map<number, WordGrammarWithRule[]>();
  for (const row of rows) {
    const list = byWord.get(row.word_id) ?? [];
    list.push(row);
    byWord.set(row.word_id, list);
  }

  let conflictCreated = 0;
  let conflictSkipped = 0;
  const conflictingWords = new Set<number>();
  for (const [wordId, wordRows] of byWord) {
    const view = buildGrammarView(wordRows, posMap);
    const conflicting = view.filter((a) => a.conflict);
    if (conflicting.length === 0) continue;
    conflictingWords.add(wordId);

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

  // --- Reconcile: retire this reporter's flags that no longer hold ---
  const resolvedAt = new Date().toISOString();
  const dismiss = async (ids: number[], note: string) => {
    for (let i = 0; i < ids.length; i += 500) {
      const { error } = await db
        .from("flags")
        .update({ status: "dismissed", resolved_at: resolvedAt, resolution_note: note })
        .in("id", ids.slice(i, i + 500));
      if (error) throw new Error(`flag dismiss: ${error.message}`);
    }
  };

  // Doubt flags: every one targeted a retired ending-rule reading.
  const openDoubtFlags = await fetchAllRows<{ id: number }>("open auto doubt flags", () =>
    db
      .from("flags")
      .select("id")
      .eq("status", "open")
      .eq("reporter_name", SYSTEM_REPORTER)
      .eq("flag_type", "unclear")
      .eq("target_table", "word_grammar")
      .order("id", { ascending: true })
  );
  const staleDoubt = openDoubtFlags.map((f) => f.id);
  await dismiss(
    staleDoubt,
    "Auto-dismissed: the flagged reading came from a retired Viakaran ending rule and is no longer shown (migration 037)."
  );
  console.log(`Doubt flags dismissed: ${staleDoubt.length}`);

  const openConflictFlags = await fetchAllRows<{ id: number; word_id: number }>("open auto conflict flags", () =>
    db
      .from("flags")
      .select("id, word_id")
      .eq("status", "open")
      .eq("reporter_name", SYSTEM_REPORTER)
      .eq("flag_type", "incorrect")
      .is("target_table", null)
      .order("id", { ascending: true })
  );
  const stale = openConflictFlags.filter((f) => !conflictingWords.has(f.word_id)).map((f) => f.id);
  await dismiss(stale, "Auto-dismissed: the grammar view no longer finds a cross-source conflict on this word.");
  console.log(`Conflict flags dismissed as no longer conflicting: ${stale.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
