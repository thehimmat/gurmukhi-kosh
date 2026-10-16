/**
 * Vishraam (pause) marks ingestion (#217).
 *
 * BaniDB's v2 ang endpoint carries each verse's `visraam` marks in three sets
 * (igurbani, sttm, sttm2), which the other ingests discard. This stores them
 * on lines.vishraam (migration 058), normalised by lib/vishraam.ts.
 * Idempotent: a line is written only when its marks change.
 *
 * Usage (from gurmukhi-kosh project root):
 *   npm run ingest:vishraam                                  # all of SGGS
 *   npm run ingest:vishraam -- --start=1 --end=8             # Japji
 *   npm run ingest:vishraam -- --source=dasam_banidb_v2      # Dasam Granth
 *
 * Bhai Gurdas Ji's Vaaran have no marks in BaniDB.
 *
 * Requires in .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { supabaseAdmin } from "../shared/db";
import { lineIdByVerseId, type LineQuery } from "../shared/lines";
import { fetchAng, type BaniDBSourceId } from "../../lib/banidb";
import { normalizeVishraam } from "../../lib/vishraam";
import { getArg, sleep, progress } from "../shared/utils";

const CORPUS: Record<string, { banidbSource: BaniDBSourceId; totalAngs: number }> = {
  sggs_banidb_v2: { banidbSource: "G", totalAngs: 1430 },
  dasam_banidb_v2: { banidbSource: "D", totalAngs: 1428 },
};

async function main() {
  const db = supabaseAdmin();
  const code = getArg("source") || "sggs_banidb_v2";
  const corpus = CORPUS[code];
  if (!corpus) {
    console.error(`No vishraam for '${code}'; known: ${Object.keys(CORPUS).join(", ")}`);
    process.exit(1);
  }
  const start = parseInt(getArg("start") || "1", 10);
  const end = parseInt(getArg("end") || String(corpus.totalAngs), 10);

  const { data: src, error: srcErr } = await db.from("sources").select("id, name").eq("code", code).single();
  if (srcErr || !src) {
    console.error(`Source '${code}' not found in the sources table.`);
    process.exit(1);
  }
  const sourceFk = src.id as number;
  console.log(`Ingesting vishraam for ${src.name}, angs ${start}-${end}...`);

  const t0 = Date.now();
  let changed = 0;
  let marked = 0;
  let missing = 0;

  for (let ang = start; ang <= end; ang++) {
    const { page } = await fetchAng(ang, corpus.banidbSource);
    const lineIdByVerse = await lineIdByVerseId(
      // Cast: see pipeline/translations/ingest.ts (TS2589).
      () => db.from("lines").select("id, verse_id") as unknown as LineQuery,
      sourceFk,
      page.map((v) => v.verseId),
    ).catch((e: Error) => {
      console.error(`\nlines lookup failed (ang ${ang}):`, e.message);
      process.exit(1);
    });

    const rows: { id: number; v: unknown }[] = [];
    for (const verse of page) {
      const id = lineIdByVerse.get(verse.verseId);
      if (id == null) { missing++; continue; }
      const v = normalizeVishraam(verse.visraam, verse.verse.unicode.trim().split(/\s+/).length);
      if (v) marked++;
      rows.push({ id, v });
    }

    if (rows.length) {
      const { data, error } = await db.rpc("set_lines_vishraam", { p_rows: rows });
      if (error) {
        console.error(`\nwrite failed (ang ${ang}):`, error.message);
        process.exit(1);
      }
      changed += (data as number) ?? 0;
    }

    progress(ang - start + 1, end - start + 1, t0, "Angs ");
    await sleep(150); // be polite to the API
  }

  console.log(
    `\nDone. ${marked} lines carry marks; ${changed} updated` +
      (missing ? ` (${missing} verses had no matching line)` : "") + ".",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
