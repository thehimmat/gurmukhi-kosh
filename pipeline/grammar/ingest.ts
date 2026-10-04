/**
 * Grammar ingestion: Mahan Kosh part of speech.
 *
 * Writes one word_grammar row per distinct POS marker in a word's Mahan Kosh
 * senses, attributed to Mahan Kosh (provenance 'scraped', source_code
 * 'mahan_kosh'). Nothing is inferred from a word's spelling: no case, number,
 * gender or verb form, no POS carried over from a similarly spelled word, and
 * no lexeme grouping. Those come only from sources that state them (Shackle
 * inflections #18, the manual pipeline #2, Sahib Singh #24) — see #30.
 *
 * Usage (from gurmukhi-kosh project root):
 *   npm run ingest:grammar                 # default word set: japji
 *   npm run ingest:grammar -- --word-set=japji
 *
 * Requires in .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { supabaseAdmin } from "../shared/db";
import { fetchWordSet } from "../shared/word-sets";
import { getArg, progress } from "../shared/utils";
import { fetchAllRows } from "../../lib/fetch-all-rows";
import { mahanKoshGrammarRows, type MahanKoshGrammarRow } from "./build";

const MAHAN_KOSH_CODE = "mahan_kosh";

async function main() {
  const db = supabaseAdmin();
  const setCode = getArg("word-set") || "japji";

  console.log(`Word set: ${setCode}`);
  const members = await fetchWordSet(db, setCode);
  console.log(`Members: ${members.length}`);

  const wordIds = members.map((m) => m.word_id);

  // 1. Pull Mahan Kosh senses for these words → word_id → definition_text[].
  const { data: dictSource } = await db
    .from("dict_sources")
    .select("id")
    .eq("code", MAHAN_KOSH_CODE)
    .single();
  if (!dictSource) {
    console.error(`dict_source '${MAHAN_KOSH_CODE}' not found.`);
    process.exit(1);
  }

  const sensesByWord = new Map<number, { definition_text: string }[]>();
  for (let i = 0; i < wordIds.length; i += 200) {
    const batch = wordIds.slice(i, i + 200);
    // 200 multi-sense words can hold well over 1000 definition rows; ordered
    // by word_id first so pages are stable, then sense_number so each word's
    // first-listed sense stays its primary POS.
    const data = await fetchAllRows<{
      word_id: number;
      sense_number: number;
      definition_text: string;
    }>("grammar senses", () =>
      db
        .from("definitions")
        .select("word_id, sense_number, definition_text")
        .eq("dict_source_id", dictSource.id)
        .in("word_id", batch)
        .order("word_id", { ascending: true })
        .order("sense_number", { ascending: true })
    );
    for (const row of data) {
      const list = sensesByWord.get(row.word_id) ?? [];
      list.push({ definition_text: row.definition_text });
      sensesByWord.set(row.word_id, list);
    }
  }
  console.log(`Words with Mahan Kosh senses: ${sensesByWord.size}`);

  // 2. Build word_grammar rows: POS only, straight from the markers.
  const grammarRows: Array<MahanKoshGrammarRow & { word_id: number }> = [];
  for (const m of members) {
    const senses = sensesByWord.get(m.word_id);
    if (!senses?.length) continue;
    for (const g of mahanKoshGrammarRows(senses)) grammarRows.push({ word_id: m.word_id, ...g });
  }
  console.log(`Grammar rows to write: ${grammarRows.length}`);

  // Idempotent replace: drop only the rows this pipeline owns (Mahan Kosh POS)
  // for this set's words. Chunked — a single .in() with tens of thousands of
  // ids overflows the URL (Cloudflare 414) past a few hundred members.
  for (let i = 0; i < wordIds.length; i += 300) {
    const batch = wordIds.slice(i, i + 300);
    const { error: delGramErr } = await db
      .from("word_grammar")
      .delete()
      .in("word_id", batch)
      .eq("source_code", MAHAN_KOSH_CODE);
    if (delGramErr) {
      console.error("word_grammar delete error:", delGramErr.message);
      process.exit(1);
    }
  }

  let gramDone = 0;
  const t0 = Date.now();
  for (let i = 0; i < grammarRows.length; i += 100) {
    const batch = grammarRows.slice(i, i + 100);
    const { error } = await db.from("word_grammar").insert(batch);
    if (error) {
      console.error(`\nword_grammar insert error:`, error.message);
      process.exit(1);
    }
    gramDone += batch.length;
    progress(gramDone, grammarRows.length, t0, "Grammar ");
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\nDone in ${elapsed}s. word_grammar: ${gramDone}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
