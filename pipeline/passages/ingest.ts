/**
 * Passages ingestion (#219): every BaniDB bani's paragraphs, matched to our
 * lines by page and text (lib/passages.ts), into `banis` and `passages`
 * (migration 059). Re-running replaces each bani's passages.
 *
 * Usage (from gurmukhi-kosh project root):
 *   npm run ingest:passages                  # every bani
 *   npm run ingest:passages -- --banis=2,4   # Japji and Jaap only
 *   npm run ingest:passages -- --dry-run     # report matches, write nothing
 *
 * Requires in .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { supabaseAdmin } from "../shared/db";
import { fetchBani, fetchBanis } from "../../lib/banidb";
import { alignBani, type BaniVerse, type CorpusLine } from "../../lib/passages";
import { getArg, sleep } from "../shared/utils";

// Our scriptures a bani can draw on, by BaniDB SourceID. A bani verse names
// only its page, so a page's candidates span all of them, the bani's own
// scripture first; text equality picks the line.
const SOURCES: Record<string, string> = { G: "sggs_banidb_v2", D: "dasam_banidb_v2", B: "bhai_gurdas_banidb_v2" };

async function main() {
  const db = supabaseAdmin();
  const dry = process.argv.includes("--dry-run");
  const only = (getArg("banis") || "").split(",").map(Number).filter(Boolean);

  const { data: srcRows, error: srcErr } = await db.from("sources").select("id, code").in("code", Object.values(SOURCES));
  if (srcErr) throw new Error(srcErr.message);
  const sourceFk = new Map(Object.entries(SOURCES).map(([k, code]) => [k, srcRows!.find((r) => r.code === code)?.id as number]));
  const allFks = [...sourceFk.values()].filter(Boolean);

  const pageCache = new Map<number, CorpusLine[]>();
  async function linesOn(page: number): Promise<CorpusLine[]> {
    if (!pageCache.has(page)) {
      const { data, error } = await db.from("lines")
        .select("id, verse_id, source_fk, ang, gurmukhi")
        .in("source_fk", allFks).eq("ang", page)
        .order("source_fk").order("verse_id");
      if (error) throw new Error(`lines on page ${page}: ${error.message}`);
      pageCache.set(page, (data ?? []) as CorpusLine[]);
    }
    return pageCache.get(page)!;
  }

  const listing = (await fetchBanis()).filter((b) => !only.length || only.includes(b.ID));
  console.log(`Passages for ${listing.length} banis${dry ? " (dry run)" : ""}...`);
  let total = 0;
  let missed = 0;

  for (const b of listing) {
    const bani = await fetchBani(b.ID);
    const own = sourceFk.get(bani.baniInfo?.source?.sourceId ?? "G");
    const verses: BaniVerse[] = bani.verses
      .filter((v) => v.verse?.verse?.unicode && v.paragraph != null)
      .map((v) => ({ paragraph: v.paragraph!, page: v.verse.pageNo, text: v.verse.verse!.unicode }));
    for (const page of new Set(verses.map((v) => v.page))) await linesOn(page);
    const { runs, unmatched } = alignBani(verses, (page) => {
      const lines = pageCache.get(page) ?? [];
      return [...lines.filter((l) => l.source_fk === own), ...lines.filter((l) => l.source_fk !== own)];
    });
    const paragraphs = new Set(runs.map((r) => r.ordinal)).size;
    total += runs.length;
    missed += unmatched.length;
    console.log(`  ${String(b.ID).padStart(3)} ${b.token.padEnd(24)} ${verses.length} verses → ${runs.length} passages` +
      (unmatched.length ? `, ${unmatched.length} unmatched` : ""));

    if (dry || !runs.length) { await sleep(150); continue; }
    const { error: bErr } = await db.from("banis").upsert({
      id: b.ID, token: b.token, name_gurmukhi: b.gurmukhiUni,
      name_english: bani.baniInfo?.english ?? b.transliteration ?? null, paragraphs,
    });
    if (bErr) throw new Error(`bani ${b.ID}: ${bErr.message}`);
    const { error: dErr } = await db.from("passages").delete().eq("bani_id", b.ID);
    if (dErr) throw new Error(`clear bani ${b.ID}: ${dErr.message}`);
    const { error: iErr } = await db.from("passages").insert(runs.map((r) => ({
      bani_id: b.ID, ordinal: r.ordinal, part: r.part, source_fk: r.source_fk,
      first_verse_id: r.first.verse_id, last_verse_id: r.last.verse_id,
    })));
    if (iErr) throw new Error(`passages for bani ${b.ID}: ${iErr.message}`);
    await sleep(150); // be polite to the API
  }

  console.log(`\nDone. ${total} passages${missed ? `; ${missed} bani verses matched no line` : ""}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
