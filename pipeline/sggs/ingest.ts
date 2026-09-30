/**
 * Corpus ingestion pipeline: fetches a BaniDB source page by page and
 * populates Supabase (lines, shabads, words, word_occurrences, and both
 * frequency layers: words.frequency totals + word_corpus_stats per corpus).
 *
 * Usage:
 *   npm run ingest                              # full SGGS (angs 1–1430)
 *   npm run ingest:sggs:range -- --start=1 --end=50
 *   npm run ingest:bhaigurdas                   # Bhai Gurdas Vaaran (vaars 1–40)
 *   npm run ingest -- --source=<sources.code>   # any registered corpus
 *
 * Requires in .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { supabaseAdmin } from "../shared/db";
import { fetchAng, type BaniDBSourceId, type BaniDBVerse } from "../../lib/banidb";
import { tokenize } from "../../lib/tokenizer";
import { sleep, parseArgs, progress } from "../shared/utils";
import { shabadUpsertRow } from "./shabad-meta";

// Registry: our sources.code → the BaniDB SourceID and the source's page
// count ("ang" = the source's own page unit; for Bhai Gurdas, the vaar).
const CORPUS: Record<string, { banidbSource: BaniDBSourceId; totalAngs: number }> = {
  sggs_banidb_v2: { banidbSource: "G", totalAngs: 1430 },
  bhai_gurdas_banidb_v2: { banidbSource: "B", totalAngs: 40 },
  dasam_banidb_v2: { banidbSource: "D", totalAngs: 1428 },
};

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
const shabadsWithWriter = new Set<number>();

// The first verse of a shabad creates its row. Later verses only fill a writer
// the earlier ones lacked (#86): BaniDB reports writer per verse, and a shabad
// whose first verse had none used to stay null for good.
async function upsertShabad(db: ReturnType<typeof supabaseAdmin>, verse: BaniDBVerse) {
  const row = shabadUpsertRow(verse);
  const hasWriter = row.writer_english !== undefined;
  if (!insertedShabads.has(verse.shabadId)) {
    const { error } = await db.from("shabads").upsert(row, { onConflict: "id" });
    if (error) {
      console.error(`Shabad upsert error (${verse.shabadId}):`, error.message);
      return;
    }
    insertedShabads.add(verse.shabadId);
    if (hasWriter) shabadsWithWriter.add(verse.shabadId);
    return;
  }
  if (!hasWriter || shabadsWithWriter.has(verse.shabadId)) return;
  const { error } = await db
    .from("shabads")
    .update({ writer_english: row.writer_english, writer_id: row.writer_id })
    .eq("id", verse.shabadId);
  if (error) console.error(`Shabad writer update error (${verse.shabadId}):`, error.message);
  else shabadsWithWriter.add(verse.shabadId);
}

async function processAng(
  db: ReturnType<typeof supabaseAdmin>,
  ang: number,
  sourceFk: number,
  banidbSource: BaniDBSourceId
) {
  const data = await fetchAng(ang, banidbSource);

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
    // A dropped word means dropped occurrences below, so surface it as a
    // failed ang (retryable) rather than a logged line nobody reads.
    if (wordErr) throw new Error(`word upsert (ang ${ang}, verse ${verse.verseId}): ${wordErr.message}`);

    const { data: wordRows, error: fetchErr } = await db
      .from("words")
      .select("id, gurmukhi")
      .in("gurmukhi", tokens);

    if (fetchErr || !wordRows) {
      throw new Error(`word fetch (ang ${ang}, verse ${verse.verseId}): ${fetchErr?.message}`);
    }

    const wordMap = new Map(wordRows.map((w) => [w.gurmukhi, w.id]));

    // Every token must resolve. Silently skipping unresolved ones (the old
    // `.filter(Boolean)`) is how the Dasam run lost occurrences with no
    // signal — see pipeline/verify/occurrences.ts.
    const occurrences = tokens.map((token, pos) => {
      const wordId = wordMap.get(token);
      if (!wordId) {
        throw new Error(`token '${token}' (ang ${ang}, verse ${verse.verseId}) did not resolve to a word row`);
      }
      return { word_id: wordId, line_id: lineId, position: pos };
    });

    if (occurrences.length > 0) {
      const { error: occErr } = await db
        .from("word_occurrences")
        .upsert(occurrences, { ignoreDuplicates: true });
      if (occErr) throw new Error(`occurrence insert (ang ${ang}, verse ${verse.verseId}): ${occErr.message}`);
    }
  }
}

async function main() {
  const db = supabaseAdmin();
  const args = parseArgs({ start: 1, end: 0, source: "sggs_banidb_v2" });
  const corpus = CORPUS[args.sourceCode];
  if (!corpus) {
    console.error(`Unknown corpus '${args.sourceCode}'. Registered: ${Object.keys(CORPUS).join(", ")}`);
    process.exit(1);
  }
  const start = args.start;
  const end = args.end || corpus.totalAngs;
  const sourceFk = await resolveSource(db, args.sourceCode);

  const failed: number[] = [];
  console.log(`\nIngesting angs ${start}–${end} from source '${args.sourceCode}' (BaniDB ${corpus.banidbSource})`);
  const t0 = Date.now();

  for (let ang = start; ang <= end; ang++) {
    try {
      await processAng(db, ang, sourceFk, corpus.banidbSource);
      progress(ang, end, t0, "Ang ");
    } catch (err) {
      console.error(`\nFailed ang ${ang}:`, err);
      failed.push(ang);
    }
    if (ang < end) await sleep(DELAY_MS);
  }

  console.log(`\n\nDone. Failed angs: ${failed.length > 0 ? failed.join(", ") : "none"}`);

  await db.from("sources").update({ ingested_at: new Date().toISOString() }).eq("id", sourceFk);

  // Both frequency layers (#65): words.frequency = total across corpora,
  // word_corpus_stats = the per-corpus split (also flips in_corpus for
  // dictionary head-words a newly ingested text attests). A failed refresh
  // must abort loudly: these full-table rebuilds can hit the PostgREST
  // statement timeout, and an unchecked rpc() once left the stats empty
  // while the run reported success.
  console.log("Refreshing word frequencies (total + per-corpus)...");
  for (const fn of ["refresh_word_frequencies", "refresh_word_corpus_stats"] as const) {
    const { error } = await db.rpc(fn);
    if (error) {
      console.error(`${fn} FAILED: ${error.message}`);
      console.error(`Re-run it directly (SQL: select ${fn}();) before trusting any frequency.`);
      process.exit(1);
    }
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`Frequencies updated. Total time: ${elapsed}s`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
