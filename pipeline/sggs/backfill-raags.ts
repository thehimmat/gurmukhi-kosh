/**
 * Backfills raag_english and raag_gurmukhi on the shabads table.
 * Fetches one ang per unique (shabad_id, ang) pair from the lines table,
 * then updates the shabads row. Idempotent — safe to re-run.
 *
 * Usage:
 *   npx tsx pipeline/sggs/backfill-raags.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { supabaseAdmin } from "../shared/db";
import { fetchAng } from "../../lib/banidb";
import { sleep, progress } from "../shared/utils";

const DELAY_MS = 150;

async function main() {
  const db = supabaseAdmin();

  // Get one representative ang per shabad (the lowest ang it appears on)
  const { data: shabadAngs, error } = await db
    .from("lines")
    .select("shabad_id, ang")
    .order("ang", { ascending: true });

  if (error || !shabadAngs) {
    console.error("Failed to fetch shabad/ang pairs:", error?.message);
    process.exit(1);
  }

  // Deduplicate — one ang per shabad_id
  const shabadToAng = new Map<number, number>();
  for (const row of shabadAngs) {
    if (!shabadToAng.has(row.shabad_id)) shabadToAng.set(row.shabad_id, row.ang);
  }

  // Deduplicate angs — one fetch per ang covers all shabads on that ang
  const angToShabads = new Map<number, number[]>();
  for (const [shabadId, ang] of shabadToAng) {
    if (!angToShabads.has(ang)) angToShabads.set(ang, []);
    angToShabads.get(ang)!.push(shabadId);
  }

  const angs = [...angToShabads.keys()].sort((a, b) => a - b);
  console.log(`Fetching ${angs.length} unique angs to backfill ${shabadToAng.size} shabads...`);

  const t0 = Date.now();
  let done = 0;
  let updated = 0;
  let failed = 0;

  for (const ang of angs) {
    try {
      const data = await fetchAng(ang);

      // Build raag map from this ang's verses
      const raagMap = new Map<number, { english: string | null; unicode: string | null }>();
      for (const verse of data.page) {
        if (!raagMap.has(verse.shabadId)) {
          raagMap.set(verse.shabadId, {
            english: verse.raag?.english ?? null,
            unicode: verse.raag?.unicode ?? null,
          });
        }
      }

      // Update each shabad we care about from this ang
      for (const shabadId of angToShabads.get(ang) ?? []) {
        const raag = raagMap.get(shabadId);
        if (!raag) continue;
        const { error: upErr } = await db
          .from("shabads")
          .update({ raag_english: raag.english, raag_gurmukhi: raag.unicode })
          .eq("id", shabadId);
        if (upErr) {
          console.error(`Update error shabad ${shabadId}:`, upErr.message);
          failed++;
        } else {
          updated++;
        }
      }

      done++;
      progress(done, angs.length, t0, "Ang ");
    } catch (err) {
      console.error(`\nFailed ang ${ang}:`, err);
      failed++;
    }
    await sleep(DELAY_MS);
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n\nDone in ${elapsed}s. Updated: ${updated} shabads. Errors: ${failed}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
