/**
 * SGGS ingestion pipeline: fetches angs from BaniDB and populates Supabase.
 *
 * Usage:
 *   npm run ingest                            # full SGGS (angs 1–1430)
 *   npm run ingest:sggs:range -- --start=1 --end=50
 *   npm run ingest -- --source=sggs_banidb_v2  # explicit source code
 *
 * Requires in .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { supabaseAdmin } from "../shared/db";
import { fetchAng, type BaniDBVerse } from "../../lib/banidb";
import { tokenize } from "../../lib/tokenizer";
import { sleep, parseArgs, progress } from "../shared/utils";

const TOTAL_ANGS = 1430;
const DELAY_MS = 150;

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
    console.error(`Create it first with an INSERT into sources (code, name, version, description).`);
    process.exit(1);
  }
  console.log(`Source: [${data.id}] ${data.name} (${data.code})`);
  return data.id;
}

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
    await upsertShabad(db, verse);

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
    const tokens = tokenize(verse.verse.unicode);
    if (tokens.length === 0) continue;

    const { error: wordErr } = await db.from("words").upsert(
      tokens.map((g) => ({ gurmukhi: g, frequency: 0 })),
      { onConflict: "gurmukhi", ignoreDuplicates: true }
    );
    if (wordErr) console.error(`Word upsert error (ang ${ang}):`, wordErr.message);

    const { data: wordRows, error: fetchErr } = await db
      .from("words")
      .select("id, gurmukhi")
      .in("gurmukhi", tokens);

    if (fetchErr || !wordRows) {
      console.error(`Word fetch error (ang ${ang}):`, fetchErr?.message);
      continue;
    }

    const wordMap = new Map(wordRows.map((w) => [w.gurmukhi, w.id]));

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
  const { start, end, sourceCode } = parseArgs({ start: 1, end: TOTAL_ANGS, source: "sggs_banidb_v2" });
  const sourceFk = await resolveSource(db, sourceCode);

  const failed: number[] = [];
  console.log(`\nIngesting angs ${start}–${end} from source '${sourceCode}'`);
  const t0 = Date.now();

  for (let ang = start; ang <= end; ang++) {
    try {
      await processAng(db, ang, sourceFk);
      progress(ang, end, t0, "Ang ");
    } catch (err) {
      console.error(`\nFailed ang ${ang}:`, err);
      failed.push(ang);
    }
    if (ang < end) await sleep(DELAY_MS);
  }

  console.log(`\n\nDone. Failed angs: ${failed.length > 0 ? failed.join(", ") : "none"}`);

  await db.from("sources").update({ ingested_at: new Date().toISOString() }).eq("id", sourceFk);

  console.log("Refreshing word frequencies...");
  await db.rpc("refresh_word_frequencies");

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`Frequencies updated. Total time: ${elapsed}s`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
