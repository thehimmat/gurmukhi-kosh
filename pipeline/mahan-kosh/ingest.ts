/**
 * Mahan Kosh ingestion pipeline — Phase 2.
 *
 * Reads pipeline/mahan-kosh/output/entries.jsonl (produced by scrape.py) and
 * upserts each sense into the `definitions` table in Supabase.
 *
 * Usage (from gurmukhi-kosh project root):
 *   npm run ingest:mahankosh
 *
 * Requires in .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Idempotent: re-running is safe — all upserts use onConflict on
 * (word_id, dict_source_id, coalesce(sense_number, 0)).
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import * as fs from "fs";
import * as readline from "readline";
import { supabaseAdmin } from "../shared/db";
import { sleep, progress } from "../shared/utils";

const JSONL_PATH = "pipeline/mahan-kosh/output/entries.jsonl";
const DICT_SOURCE_CODE = "mahan_kosh";
const BATCH_SIZE = 50; // definitions upserted per DB call

interface Sense {
  sense_number: number;
  definition_text: string;
  cross_refs: Record<string, string> | null;
}

interface JournalEntry {
  gurmukhi: string;
  found: boolean;
  entry_gurmukhi?: string;
  mk_id?: number;
  source_url?: string;
  senses?: Sense[];
}

async function resolveDictSource(
  db: ReturnType<typeof supabaseAdmin>,
  code: string
): Promise<number> {
  const { data, error } = await db
    .from("dict_sources")
    .select("id, name")
    .eq("code", code)
    .single();
  if (error || !data) {
    console.error(`dict_source '${code}' not found. Run migration 002 first.`);
    process.exit(1);
  }
  console.log(`Dict source: [${data.id}] ${data.name}`);
  return data.id;
}

async function readJsonl(path: string): Promise<JournalEntry[]> {
  if (!fs.existsSync(path)) {
    console.error(`JSONL not found: ${path}`);
    console.error(`Run 'python3 pipeline/mahan-kosh/scrape.py' first.`);
    process.exit(1);
  }

  const entries: JournalEntry[] = [];
  const rl = readline.createInterface({
    input: fs.createReadStream(path, "utf-8"),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      entries.push(JSON.parse(trimmed));
    } catch {
      console.warn(`Skipping malformed JSONL line: ${trimmed.slice(0, 80)}`);
    }
  }
  return entries;
}

async function main() {
  const db = supabaseAdmin();
  const dictSourceId = await resolveDictSource(db, DICT_SOURCE_CODE);

  console.log(`\nReading ${JSONL_PATH}...`);
  const allEntries = await readJsonl(JSONL_PATH);
  const foundEntries = allEntries.filter((e) => e.found && e.senses?.length);
  console.log(
    `Total JSONL lines: ${allEntries.length} | entries with senses: ${foundEntries.length}`
  );

  // Build a batch of (gurmukhi → word_id) lookups
  const gurmukhiSet = [...new Set(foundEntries.map((e) => e.gurmukhi))];
  console.log(`Resolving ${gurmukhiSet.length} unique words from DB...`);

  // Resolve in small batches: a long `.in()` of Unicode headwords blows the
  // GET URL length limit and surfaces as "fetch failed".
  const wordMap = new Map<string, number>();
  for (let i = 0; i < gurmukhiSet.length; i += 100) {
    const batch = gurmukhiSet.slice(i, i + 100);
    const { data, error } = await db
      .from("words")
      .select("id, gurmukhi")
      .in("gurmukhi", batch);
    if (error) {
      console.error("Word fetch error:", error.message);
      process.exit(1);
    }
    for (const row of data ?? []) {
      wordMap.set(row.gurmukhi, row.id);
    }
  }
  console.log(`Resolved ${wordMap.size}/${gurmukhiSet.length} words.`);

  // Flatten all entries into definition rows
  type DefRow = {
    word_id: number;
    dict_source_id: number;
    entry_gurmukhi: string | null;
    sense_number: number;
    definition_text: string;
    cross_refs: Record<string, string> | null;
    source_url: string | null;
  };

  const rows: DefRow[] = [];
  let skipped = 0;

  for (const entry of foundEntries) {
    const wordId = wordMap.get(entry.gurmukhi);
    if (!wordId) {
      skipped++;
      continue;
    }
    for (const sense of entry.senses!) {
      rows.push({
        word_id: wordId,
        dict_source_id: dictSourceId,
        entry_gurmukhi: entry.entry_gurmukhi ?? null,
        sense_number: sense.sense_number,
        definition_text: sense.definition_text,
        cross_refs: sense.cross_refs ?? null,
        source_url: entry.source_url ?? null,
      });
    }
  }

  console.log(
    `\nUpserting ${rows.length} definition rows ` +
      `(${skipped} words skipped — not in words table)...`
  );

  const t0 = Date.now();
  let done = 0;
  let errors = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await db
      .from("definitions")
      .upsert(batch, { onConflict: "word_id,dict_source_id,sense_number", ignoreDuplicates: false });

    if (error) {
      console.error(`\nUpsert error at batch ${i / BATCH_SIZE}:`, error.message);
      errors++;
    }

    done += batch.length;
    progress(done, rows.length, t0, "Defs ");
    if (i + BATCH_SIZE < rows.length) await sleep(20);
  }

  // Mark ingestion timestamp on dict_sources row
  await db
    .from("dict_sources")
    .update({ ingested_at: new Date().toISOString() })
    .eq("id", dictSourceId);

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(
    `\n\nDone. ${done} rows upserted, ${errors} errors. Total: ${elapsed}s`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
