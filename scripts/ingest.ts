/**
 * Ingestion script: fetches angs from BaniDB and populates Supabase.
 *
 * Usage:
 *   npm run ingest                            # full SGGS (angs 1–1430)
 *   npm run ingest:range -- --start=1 --end=50
 *   npm run ingest -- --source=sggs_banidb_v2  # explicit source code
 *
 * Each ingestion is tied to a row in the `sources` table via --source (default: sggs_banidb_v2).
 * Running again with the same source is safe — all upserts are idempotent.
 * Different source codes let you ingest version A and version B of a text side-by-side;
 * their words merge into the shared `words` table but occurrences stay attributed separately.
 *
 * Requires in .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import "dotenv/config";
import { supabaseAdmin } from "../lib/supabase";
import { fetchAng, type BaniDBVerse } from "../lib/banidb";
import { tokenize } from "../lib/tokenizer";

const TOTAL_ANGS = 1430;
const DELAY_MS = 150; // polite delay between BaniDB requests

function parseArgs(): { start: number; end: number; sourceCode: string } {
  const args = process.argv.slice(2);
  let start = 1;
  let end = TOTAL_ANGS;
  let sourceCode = "sggs_banidb_v2";
  for (const arg of args) {
    if (arg.startsWith("--start=")) start = parseInt(arg.split("=")[1]);
    if (arg.startsWith("--end=")) end = parseInt(arg.split("=")[1]);
    if (arg.startsWith("--source=")) sourceCode = arg.split("=")[1];
  }
  return { start, end, sourceCode };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Resolve or create a source record; returns its DB id. */
async function resolveSource(
  db: ReturnType<typeof supabaseAdmin>,
  code: string
): Promise<number> {
  const { data, error } = await db
    .from("sources")
    .select("id, code, name")
    .eq("code", code)
    .single();

  if (error || !data) {
    console.error(`Source '${code}' not found in the sources table.`);
    console.error(
      `Create it first with an INSERT into sources (code, name, version, description).`
    );
    process.exit(1);
  }

  console.log(`Source: [${data.id}] ${data.name} (${data.code})`);
  return data.id;
}

// Track shabads inserted this run to skip redundant upserts
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

async function processAng(
  db: ReturnType<typeof supabaseAdmin>,
  ang: number,
  sourceFk: number
) {
  const data = await fetchAng(ang);

  for (const verse of data.page) {
    // 1. Upsert shabad metadata (shared across all sources — same shabad is the same shabad)
    await upsertShabad(db, verse);

    // 2. Upsert line — unique per (source_fk, verse_id)
    //    If this source+verse already exists, returns the existing row.
    const { data: lineData, error: lineErr } = await db
      .from("lines")
      .upsert(
        {
          source_fk: sourceFk,
          verse_id: verse.verseId,
          shabad_id: verse.shabadId,
          ang: verse.pageNo,
          line_no: verse.lineNo,
          gurmukhi: verse.verse.unicode,
          translation_en: verse.translation?.en?.bdb ?? verse.translation?.en?.ms ?? null,
          transliteration_en: verse.transliteration?.english ?? null,
        },
        { onConflict: "source_fk,verse_id" }
      )
      .select("id")
      .single();

    if (lineErr || !lineData) {
      console.error(`Line upsert error (ang ${ang}, verseId ${verse.verseId}):`, lineErr?.message);
      continue;
    }

    const lineId = lineData.id;

    // 3. Tokenize — words are global, not per-source
    const tokens = tokenize(verse.verse.unicode);
    if (tokens.length === 0) continue;

    // 4. Upsert words globally (same Gurmukhi form from any source → same word row)
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

    // 6. Upsert occurrences — idempotent via (word_id, line_id, position) unique index
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
  const { start, end, sourceCode } = parseArgs();

  // Resolve source row
  const sourceFk = await resolveSource(db, sourceCode);

  const failed: number[] = [];
  console.log(`\nIngesting angs ${start}–${end} from source '${sourceCode}'`);
  const t0 = Date.now();

  for (let ang = start; ang <= end; ang++) {
    try {
      await processAng(db, ang, sourceFk);
      const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
      process.stdout.write(`\r[${elapsed}s] Processed ang ${ang}/${end}`);
    } catch (err) {
      console.error(`\nFailed ang ${ang}:`, err);
      failed.push(ang);
    }
    if (ang < end) await sleep(DELAY_MS);
  }

  console.log(`\n\nDone. Failed angs: ${failed.length > 0 ? failed.join(", ") : "none"}`);

  // Mark ingestion timestamp on the source record
  await db
    .from("sources")
    .update({ ingested_at: new Date().toISOString() })
    .eq("id", sourceFk);

  console.log("Refreshing word frequencies...");
  await db.rpc("refresh_word_frequencies");

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`Frequencies updated. Total time: ${elapsed}s`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
