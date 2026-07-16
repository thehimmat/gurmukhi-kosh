/**
 * SikhRI ingestion — Phase 2.
 *
 * Reads pipeline/sikhri/output/entries.jsonl (from scrape.ts) and writes each
 * entry's English meaning into `definitions` under dict_source 'sikhri', joined
 * to our `words` table on the Gurmukhi headword. A word with several homograph
 * entries (different `wn`) becomes several senses, ordered by wn id for stable
 * numbering across re-runs.
 *
 * The grammar and etymology strings captured in the JSONL are intentionally
 * NOT ingested here — SikhRI's per-word grammar belongs in `word_grammar` under
 * the sourced-grammar model (source_code/provenance='imported'), which is a
 * separate, more careful ingest. This phase ships the English meanings only.
 *
 * Usage: npm run ingest:sikhri
 * Requires in .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 *
 * Idempotent + takedown-proof: every 'sikhri' definition is deleted and
 * re-inserted from the full JSONL, so a single `delete ... where
 * dict_source_id = <sikhri>` (or just not re-running) removes the source
 * entirely on request.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import * as fs from "fs";
import * as readline from "readline";
import { supabaseAdmin } from "../shared/db";
import { sleep, progress } from "../shared/utils";

const JSONL_PATH = "pipeline/sikhri/output/entries.jsonl";
const DICT_SOURCE_CODE = "sikhri";
const BATCH_SIZE = 50;

interface JournalEntry {
  gurmukhi: string;
  wn: string;
  wn_id: string;
  found: boolean;
  headword_roman: string | null;
  meaning: string | null;
  grammar: string | null;
  etymology: string | null;
  source_url: string;
}

async function resolveDictSource(db: ReturnType<typeof supabaseAdmin>, code: string): Promise<number> {
  const { data, error } = await db.from("dict_sources").select("id, name").eq("code", code).single();
  if (error || !data) {
    console.error(`dict_source '${code}' not found. Apply migration 017_sikhri_source first.`);
    process.exit(1);
  }
  console.log(`Dict source: [${data.id}] ${data.name}`);
  return data.id;
}

async function readJsonl(path: string): Promise<JournalEntry[]> {
  if (!fs.existsSync(path)) {
    console.error(`JSONL not found: ${path}. Run 'npx tsx pipeline/sikhri/scrape.ts' first.`);
    process.exit(1);
  }
  const entries: JournalEntry[] = [];
  const rl = readline.createInterface({ input: fs.createReadStream(path, "utf-8"), crlfDelay: Infinity });
  for await (const line of rl) {
    const t = line.trim();
    if (!t) continue;
    try {
      entries.push(JSON.parse(t));
    } catch {
      console.warn(`Skipping malformed JSONL line: ${t.slice(0, 80)}`);
    }
  }
  return entries;
}

async function main() {
  const db = supabaseAdmin();
  const dictSourceId = await resolveDictSource(db, DICT_SOURCE_CODE);

  console.log(`\nReading ${JSONL_PATH}...`);
  const all = await readJsonl(JSONL_PATH);
  const withMeaning = all.filter((e) => e.found && e.meaning);
  console.log(`JSONL lines: ${all.length} | with an English meaning: ${withMeaning.length}`);

  // Resolve gurmukhi → word_id in small batches (a long `.in()` of Unicode
  // headwords blows the GET URL length limit).
  const gurmukhiSet = [...new Set(withMeaning.map((e) => e.gurmukhi))];
  const wordMap = new Map<string, number>();
  for (let i = 0; i < gurmukhiSet.length; i += 100) {
    const batch = gurmukhiSet.slice(i, i + 100);
    const { data, error } = await db.from("words").select("id, gurmukhi").in("gurmukhi", batch);
    if (error) {
      console.error("Word fetch error:", error.message);
      process.exit(1);
    }
    for (const row of data ?? []) wordMap.set(row.gurmukhi, row.id);
  }
  console.log(`Resolved ${wordMap.size}/${gurmukhiSet.length} words.`);

  // Group entries by word, assign a stable sense_number per homograph (wn id order).
  const byWord = new Map<number, JournalEntry[]>();
  let skipped = 0;
  for (const e of withMeaning) {
    const wordId = wordMap.get(e.gurmukhi);
    if (!wordId) {
      skipped++;
      continue;
    }
    (byWord.get(wordId) ?? byWord.set(wordId, []).get(wordId)!).push(e);
  }

  type DefRow = {
    word_id: number;
    dict_source_id: number;
    entry_gurmukhi: string;
    sense_number: number;
    definition_text: string;
    source_url: string;
  };
  const rows: DefRow[] = [];
  for (const [wordId, entries] of byWord) {
    entries.sort((a, b) => Number(a.wn_id) - Number(b.wn_id));
    // Distinct meanings only, so identical homograph glosses don't make noise senses.
    const seen = new Set<string>();
    let sense = 0;
    for (const e of entries) {
      const text = e.meaning!.trim();
      if (seen.has(text)) continue;
      seen.add(text);
      sense++;
      rows.push({
        word_id: wordId,
        dict_source_id: dictSourceId,
        entry_gurmukhi: e.gurmukhi,
        sense_number: sense,
        definition_text: text,
        source_url: e.source_url,
      });
    }
  }
  console.log(`Definition rows to write: ${rows.length} (${byWord.size} words, ${skipped} entries skipped — word not in DB).`);

  // Idempotent + takedown-proof: wipe this source and re-insert from the full JSONL.
  const { error: delErr } = await db.from("definitions").delete().eq("dict_source_id", dictSourceId);
  if (delErr) throw new Error(`sikhri definitions delete error: ${delErr.message}`);

  const t0 = Date.now();
  let done = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await db.from("definitions").insert(batch);
    if (error) throw new Error(`sikhri definitions insert error: ${error.message}`);
    done += batch.length;
    progress(done, rows.length, t0, "Defs ");
    if (i + BATCH_SIZE < rows.length) await sleep(20);
  }

  await db.from("dict_sources").update({ ingested_at: new Date().toISOString() }).eq("id", dictSourceId);
  console.log(`\n\nDone. ${done} sikhri definition rows / ${byWord.size} words.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
