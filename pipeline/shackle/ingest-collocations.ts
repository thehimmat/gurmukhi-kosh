/**
 * Shackle's phrases (#163): load the multi-word expressions his glossary glosses (his compounds
 * and the glossed phrases in his usage notes) into dict_collocations (087), for the pad-arth
 * builder's phrase rows. Planning is pure (collocations.ts).
 *
 * Reads the main extraction, pipeline/shackle/data/glossary-entries.jsonl (gitignored), the same
 * file `npm run ingest:shackle` reads. The derived appendix is left out: its Gurmukhi is
 * reverse-transliterated, and so would its phrases' be twice over.
 *
 * Idempotent: deletes Shackle's collocations and reloads them, then reattaches saved pad-arth
 * picks to the re-created rows (padarth_relink_refs).
 *
 * Usage: npm run ingest:shackle:collocations [-- --dry-run]
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import fs from "node:fs";
import readline from "node:readline";
import { supabaseAdmin } from "../shared/db";
import { getArg, sleep } from "../shared/utils";
import { relinkPadarthPicks } from "../shared/padarth-relink";
import { planCollocations } from "./collocations";
import type { GlossaryEntry } from "./types";

const SOURCE_CODE = "shackle";
const JSONL_PATH = "pipeline/shackle/data/glossary-entries.jsonl";
const BATCH = 500;

async function readEntries(path: string): Promise<GlossaryEntry[]> {
  const out: GlossaryEntry[] = [];
  const rl = readline.createInterface({ input: fs.createReadStream(path, "utf-8"), crlfDelay: Infinity });
  for await (const line of rl) if (line.trim()) out.push(JSON.parse(line) as GlossaryEntry);
  return out;
}

async function main() {
  const dryRun = getArg("dry-run") !== undefined;
  const entries = await readEntries(getArg("file") ?? JSONL_PATH);
  const rows = planCollocations(entries);
  const byOrigin = rows.reduce<Record<string, number>>((n, r) => ({ ...n, [r.origin]: (n[r.origin] ?? 0) + 1 }), {});
  console.log(`Read ${entries.length} entries; ${rows.length} phrases`, byOrigin);

  if (dryRun) {
    for (const r of rows.slice(0, 30)) console.log(`  [${r.origin}] ${r.phraseRoman}  →  ${r.phraseGurmukhi}  =  ${r.gloss}`);
    console.log("\nDry run: nothing written.");
    return;
  }

  const db = supabaseAdmin();
  const { data: src, error } = await db.from("dict_sources").select("id").eq("code", SOURCE_CODE).single();
  if (error || !src) throw new Error(`dict_source '${SOURCE_CODE}' not found`);

  // Head words, where the corpus or a dictionary has the entry's Gurmukhi.
  const heads = [...new Set(rows.map((r) => r.headGurmukhi.normalize("NFC")))];
  const headId = new Map<string, number>();
  for (let i = 0; i < heads.length; i += 200) {
    const { data, error: e } = await db.from("words").select("id, gurmukhi").in("gurmukhi", heads.slice(i, i + 200));
    if (e) throw new Error(`words: ${e.message}`);
    for (const w of (data ?? []) as { id: number; gurmukhi: string }[]) headId.set(w.gurmukhi.normalize("NFC"), w.id);
  }

  console.log("Clearing Shackle's collocations...");
  const { error: delErr } = await db.from("dict_collocations").delete().eq("dict_source_id", src.id);
  if (delErr) throw new Error(`delete dict_collocations: ${delErr.message}`);

  const records = rows.map((r) => ({
    dict_source_id: src.id,
    source_entry: r.sourceEntry,
    head_word_id: headId.get(r.headGurmukhi.normalize("NFC")) ?? null,
    phrase_roman: r.phraseRoman,
    phrase_gurmukhi: r.phraseGurmukhi,
    members: r.members,
    gloss: r.gloss,
    pos_raw: r.posRaw,
    origin: r.origin,
  }));
  for (let i = 0; i < records.length; i += BATCH) {
    const { error: e } = await db.from("dict_collocations").insert(records.slice(i, i + BATCH));
    if (e) throw new Error(`insert dict_collocations: ${e.message}`);
    if (i + BATCH < records.length) await sleep(20);
  }
  console.log(`Inserted ${records.length} collocations (${[...headId.keys()].length} head words found).`);
  await relinkPadarthPicks(db);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
