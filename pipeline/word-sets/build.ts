/**
 * Word-set builder. Materializes the members of a named set (see sets.ts) into
 * word_sets + word_set_members so enrichment pipelines can scope to it.
 *
 * Usage (from gurmukhi-kosh project root):
 *   npm run wordset:build -- --set=japji
 *   npm run wordset:build -- --set=japji --source=sggs_banidb_v2
 *
 * Requires in .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Idempotent: re-running rebuilds the member list from scratch.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "../shared/db";
import { getArg } from "../shared/utils";
import { fetchBani } from "../../lib/banidb";
import { WORD_SETS, type WordSetDefinition } from "./sets";
import { extractVerseIds, aggregateWordCounts, chunk } from "./aggregate";

const IN_CHUNK = 300; // keep `.in()` query URLs well within limits

async function resolveSourceId(db: SupabaseClient, code: string): Promise<number> {
  const { data, error } = await db.from("sources").select("id").eq("code", code).single();
  if (error || !data) throw new Error(`source '${code}' not found in sources table`);
  return data.id as number;
}

async function lineIdsByVerseIds(
  db: SupabaseClient,
  sourceId: number,
  verseIds: number[]
): Promise<number[]> {
  const ids: number[] = [];
  for (const batch of chunk(verseIds, IN_CHUNK)) {
    const { data, error } = await db
      .from("lines")
      .select("id")
      .eq("source_fk", sourceId)
      .in("verse_id", batch);
    if (error) throw new Error(`lineIdsByVerseIds: ${error.message}`);
    for (const r of data ?? []) ids.push(r.id as number);
  }
  return ids;
}

async function resolveLineIds(
  db: SupabaseClient,
  def: WordSetDefinition,
  sourceId: number
): Promise<number[]> {
  if (def.type === "banidb_bani") {
    const bani = await fetchBani(def.baniId);
    const verseIds = extractVerseIds(bani);
    console.log(`  BaniDB bani ${def.baniId}: ${verseIds.length} verses`);
    return lineIdsByVerseIds(db, sourceId, verseIds);
  }
  if (def.type === "ang_range") {
    const { data, error } = await db
      .from("lines")
      .select("id")
      .eq("source_fk", sourceId)
      .gte("ang", def.start)
      .lte("ang", def.end);
    if (error) throw new Error(`resolveLineIds(ang_range): ${error.message}`);
    return (data ?? []).map((r) => r.id as number);
  }
  // shabad_ids
  const ids: number[] = [];
  for (const batch of chunk(def.ids, IN_CHUNK)) {
    const { data, error } = await db
      .from("lines")
      .select("id")
      .eq("source_fk", sourceId)
      .in("shabad_id", batch);
    if (error) throw new Error(`resolveLineIds(shabad_ids): ${error.message}`);
    for (const r of data ?? []) ids.push(r.id as number);
  }
  return ids;
}

async function wordCounts(db: SupabaseClient, lineIds: number[]): Promise<Map<number, number>> {
  const rows: { word_id: number }[] = [];
  for (const batch of chunk(lineIds, IN_CHUNK)) {
    const { data, error } = await db
      .from("word_occurrences")
      .select("word_id")
      .in("line_id", batch);
    if (error) throw new Error(`wordCounts: ${error.message}`);
    for (const r of data ?? []) rows.push({ word_id: r.word_id as number });
  }
  return aggregateWordCounts(rows);
}

async function main() {
  const setCode = getArg("set");
  if (!setCode || !WORD_SETS[setCode]) {
    console.error(
      `Usage: npm run wordset:build -- --set=<code>\nAvailable: ${Object.keys(WORD_SETS).join(", ")}`
    );
    process.exit(1);
  }
  const spec = WORD_SETS[setCode];
  const sourceCode = getArg("source") || "sggs_banidb_v2";

  const db = supabaseAdmin();
  console.log(`Building word set '${spec.code}' (${spec.name})`);

  const sourceId = await resolveSourceId(db, sourceCode);

  // Upsert the word_sets row.
  const { data: setRow, error: setErr } = await db
    .from("word_sets")
    .upsert(
      {
        code: spec.code,
        name: spec.name,
        description: spec.description ?? null,
        definition: spec.definition,
      },
      { onConflict: "code" }
    )
    .select("id")
    .single();
  if (setErr || !setRow) throw new Error(`upsert word_sets: ${setErr?.message}`);
  const wordSetId = setRow.id as number;

  // Resolve members.
  const lineIds = await resolveLineIds(db, spec.definition, sourceId);
  console.log(`  Resolved ${lineIds.length} lines`);
  const counts = await wordCounts(db, lineIds);
  console.log(`  Distinct words in set: ${counts.size}`);

  // Rebuild members: clear then insert.
  await db.from("word_set_members").delete().eq("word_set_id", wordSetId);
  const members = [...counts.entries()].map(([word_id, occurrence_count]) => ({
    word_set_id: wordSetId,
    word_id,
    occurrence_count,
  }));
  for (const batch of chunk(members, 500)) {
    const { error } = await db.from("word_set_members").insert(batch);
    if (error) throw new Error(`insert word_set_members: ${error.message}`);
  }

  await db.from("word_sets").update({ built_at: new Date().toISOString() }).eq("id", wordSetId);

  console.log(`\nDone. '${spec.code}': ${members.length} member words.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
