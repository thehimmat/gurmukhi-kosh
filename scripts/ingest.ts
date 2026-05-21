/**
 * Ingestion script: fetches all 1430 angs from BaniDB and populates Supabase.
 * Run with: npx tsx scripts/ingest.ts [--start=1] [--end=1430]
 *
 * Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 */

import "dotenv/config";
import { supabaseAdmin } from "../lib/supabase";
import { fetchAng, type BaniDBVerse } from "../lib/banidb";
import { tokenize } from "../lib/tokenizer";

const TOTAL_ANGS = 1430;
const DELAY_MS = 150; // polite delay between API requests

function parseArgs(): { start: number; end: number } {
  const args = process.argv.slice(2);
  let start = 1;
  let end = TOTAL_ANGS;
  for (const arg of args) {
    if (arg.startsWith("--start=")) start = parseInt(arg.split("=")[1]);
    if (arg.startsWith("--end=")) end = parseInt(arg.split("=")[1]);
  }
  return { start, end };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// Track shabads we've already inserted this run (avoids extra DB round-trips)
const insertedShabads = new Set<number>();

async function upsertShabad(db: ReturnType<typeof supabaseAdmin>, verse: BaniDBVerse) {
  if (insertedShabads.has(verse.shabadId)) return;
  const { error } = await db.from("shabads").upsert(
    {
      id: verse.shabadId,
      raag_english: verse.raag?.nameEnglish ?? null,
      raag_gurmukhi: verse.raag?.nameGurmukhi ?? null,
      writer_english: verse.writer?.english ?? null,
      writer_id: verse.writer?.writerId ?? null,
      ang_start: verse.pageNo,
    },
    { onConflict: "id" }
  );
  if (error) console.error(`Shabad upsert error (${verse.shabadId}):`, error.message);
  else insertedShabads.add(verse.shabadId);
}

async function processAng(db: ReturnType<typeof supabaseAdmin>, ang: number) {
  const data = await fetchAng(ang);

  for (const verse of data.page) {
    // 1. Upsert shabad metadata
    await upsertShabad(db, verse);

    // 2. Insert line (ignore conflict — verse_id is unique)
    const { data: lineData, error: lineErr } = await db
      .from("lines")
      .upsert(
        {
          verse_id: verse.verseId,
          shabad_id: verse.shabadId,
          ang: verse.pageNo,
          line_no: verse.lineNo,
          gurmukhi: verse.verse.unicode,
          translation_en: verse.translation?.en?.bdb ?? verse.translation?.en?.ms ?? null,
          transliteration_en: verse.transliteration?.english ?? null,
          source_id: "G",
        },
        { onConflict: "verse_id" }
      )
      .select("id")
      .single();

    if (lineErr || !lineData) {
      console.error(`Line upsert error (verseId ${verse.verseId}):`, lineErr?.message);
      continue;
    }

    const lineId = lineData.id;

    // 3. Tokenize the Unicode Gurmukhi text
    const tokens = tokenize(verse.verse.unicode);
    if (tokens.length === 0) continue;

    // 4. Upsert words (batch)
    const { error: wordErr } = await db.from("words").upsert(
      tokens.map((g) => ({ gurmukhi: g, frequency: 0 })),
      { onConflict: "gurmukhi", ignoreDuplicates: true }
    );
    if (wordErr) console.error(`Word upsert error (ang ${ang}):`, wordErr.message);

    // 5. Fetch word IDs for these tokens
    const { data: wordRows, error: fetchErr } = await db
      .from("words")
      .select("id, gurmukhi")
      .in("gurmukhi", tokens);

    if (fetchErr || !wordRows) {
      console.error(`Word fetch error (ang ${ang}):`, fetchErr?.message);
      continue;
    }

    const wordMap = new Map(wordRows.map((w) => [w.gurmukhi, w.id]));

    // 6. Insert occurrences (skip if already exist for this line)
    const occurrences = tokens
      .map((token, pos) => {
        const wordId = wordMap.get(token);
        if (!wordId) return null;
        return { word_id: wordId, line_id: lineId, position: pos };
      })
      .filter(Boolean) as { word_id: number; line_id: number; position: number }[];

    if (occurrences.length > 0) {
      const { error: occErr } = await db
        .from("word_occurrences")
        .upsert(occurrences, { ignoreDuplicates: true });
      if (occErr) console.error(`Occurrence insert error (ang ${ang}):`, occErr.message);
    }

  }
}

async function main() {
  const db = supabaseAdmin();
  const { start, end } = parseArgs();
  const failed: number[] = [];

  console.log(`Starting ingestion: angs ${start}–${end}`);
  const t0 = Date.now();

  for (let ang = start; ang <= end; ang++) {
    try {
      await processAng(db, ang);
      const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
      process.stdout.write(`\r[${elapsed}s] Processed ang ${ang}/${end}`);
    } catch (err) {
      console.error(`\nFailed ang ${ang}:`, err);
      failed.push(ang);
    }
    if (ang < end) await sleep(DELAY_MS);
  }

  console.log(`\n\nDone. Failed angs: ${failed.length > 0 ? failed.join(", ") : "none"}`);
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`Total time: ${elapsed}s`);

  console.log("Refreshing word frequencies...");
  await db.rpc("refresh_word_frequencies");
  console.log("Frequencies updated.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
