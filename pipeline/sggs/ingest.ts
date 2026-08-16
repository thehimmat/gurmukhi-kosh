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

async function upsertShabad(db: ReturnType<typeof supabaseAdmin>, verse: BaniDBVerse) {
  if (insertedShabads.has(verse.shabadId)) return;
  const { error } = await db.from("shabads").upsert(
    {
      id: verse.shabadId,
      raag_english: verse.raag?.english ?? null,
      raag_gurmukhi: verse.raag?.unicode ?? null,
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
