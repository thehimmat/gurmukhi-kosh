/**
 * Per-line translations / commentaries ingestion.
 *
 * Pulls multiple cited per-line readings from the BaniDB v2 API (which we already
 * use) into line_translations so the UI can show them side by side: Sahib Singh's
 * Darpan arth and pad-arth, the Faridkot Teeka, and Bhai Manmohan Singh (Punjabi +
 * English). Originals are stored VERBATIM; we never machine-translate the older
 * commentaries. Idempotent (upsert on line_id + source_code).
 *
 * Scoped to the Japji pilot by default (angs 1-8), matching the rest of the
 * deep-dictionary work.
 *
 * Usage (from gurmukhi-kosh project root):
 *   npm run ingest:translations                 # angs 1-8 (Japji)
 *   npm run ingest:translations -- --start=1 --end=8
 *
 * Requires in .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { supabaseAdmin } from "../shared/db";
import { lineIdByVerseId, type LineQuery } from "../shared/lines";
import { fetchAng } from "../../lib/banidb";
import { getArg, sleep, progress } from "../shared/utils";

// Everything here comes from BaniDB's SGGS text, so every lookup is scoped to
// that corpus: lines.verse_id is unique only per source, and Sri Sarbloh's
// 1-36,000 overlaps SGGS exactly (#162).
const SOURCE_CODE = "sggs_banidb_v2";

// BaniDB translation field → our translation_sources.code + language.
const FIELD_MAP: Array<{ group: "pu" | "en"; key: string; source: string; lang: string }> = [
  { group: "pu", key: "ss",  source: "ss_darpan",   lang: "pa" },
  { group: "pu", key: "pss", source: "ss_padarth",  lang: "pa" },
  { group: "pu", key: "ft",  source: "faridkot",    lang: "pa" },
  { group: "pu", key: "ms",  source: "manmohan_pa", lang: "pa" },
  { group: "en", key: "ms",  source: "manmohan_en", lang: "en" },
];

type Row = {
  line_id: number;
  source_code: string;
  language: string;
  body_unicode: string;
};

async function main() {
  const db = supabaseAdmin();
  const start = parseInt(getArg("start") || "1", 10);
  const end = parseInt(getArg("end") || "8", 10);
  console.log(`Ingesting line translations for angs ${start}-${end} (BaniDB)...`);

  const { data: src, error: srcErr } = await db
    .from("sources")
    .select("id, name")
    .eq("code", SOURCE_CODE)
    .single();
  if (srcErr || !src) {
    console.error(`Source '${SOURCE_CODE}' not found in the sources table.`);
    process.exit(1);
  }
  const sourceFk = src.id as number;
  console.log(`Source: [${sourceFk}] ${src.name} (${SOURCE_CODE})`);

  const t0 = Date.now();
  let totalRows = 0;
  let missingLines = 0;

  for (let ang = start; ang <= end; ang++) {
    const { page } = await fetchAng(ang);

    // Map this ang's BaniDB verseIds → our lines.id.
    const verseIds = page.map((v) => v.verseId);
    const lineIdByVerse = await lineIdByVerseId(
      // Cast: PostgREST's builder satisfies LineQuery structurally, but letting
      // tsc prove it against the generated types hits TS2589.
      () => db.from("lines").select("id, verse_id") as unknown as LineQuery,
      sourceFk,
      verseIds
    ).catch((e: Error) => {
      console.error(`\nlines lookup failed (ang ${ang}):`, e.message);
      process.exit(1);
    });

    const rows: Row[] = [];
    for (const verse of page) {
      const lineId = lineIdByVerse.get(verse.verseId);
      if (lineId == null) {
        missingLines++;
        continue;
      }
      for (const f of FIELD_MAP) {
        const slot = verse.translation?.[f.group] as
          | Record<string, unknown>
          | undefined;
        const raw = slot?.[f.key];
        const text =
          typeof raw === "string"
            ? raw
            : (raw as { unicode?: string } | undefined)?.unicode;
        if (text && text.trim()) {
          rows.push({ line_id: lineId, source_code: f.source, language: f.lang, body_unicode: text.trim() });
        }
      }
    }

    if (rows.length) {
      const { error: upErr } = await db
        .from("line_translations")
        .upsert(rows, { onConflict: "line_id,source_code", ignoreDuplicates: false });
      if (upErr) {
        console.error(`\nupsert failed (ang ${ang}):`, upErr.message);
        process.exit(1);
      }
      totalRows += rows.length;
    }

    progress(ang - start + 1, end - start + 1, t0, "Angs ");
    await sleep(150); // be polite to the API
  }

  console.log(
    `\nDone. ${totalRows} line-translation rows upserted across angs ${start}-${end}` +
      (missingLines ? ` (${missingLines} verses had no matching line)` : "") +
      "."
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
