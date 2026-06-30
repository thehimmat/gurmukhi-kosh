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
import { fetchAng } from "../../lib/banidb";
import { getArg, sleep, progress } from "../shared/utils";

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

  const t0 = Date.now();
  let totalRows = 0;
  let missingLines = 0;

  for (let ang = start; ang <= end; ang++) {
    const { page } = await fetchAng(ang);

    // Map this ang's BaniDB verseIds → our lines.id.
    const verseIds = page.map((v) => v.verseId);
    const { data: lineRows, error } = await db
      .from("lines")
      .select("id, verse_id")
      .in("verse_id", verseIds);
    if (error) {
      console.error(`\nlines lookup failed (ang ${ang}):`, error.message);
      process.exit(1);
    }
    const lineIdByVerse = new Map<number, number>();
    for (const r of lineRows ?? []) lineIdByVerse.set(r.verse_id, r.id);

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
