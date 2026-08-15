/**
 * Populate words.search_fold (lossy orthographic key for fuzzy search, #63)
 * from each word's Gurmukhi via lib/gurmukhi-fold.ts.
 *
 * Usage (from gurmukhi-kosh project root):
 *   npm run searchfold
 *
 * Requires in .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Idempotent: recomputes and overwrites search_fold each run. Re-run after
 * any change to lib/gurmukhi-fold.ts and after ingesting new words.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { supabaseAdmin } from "../shared/db";
import { progress } from "../shared/utils";
import { foldGurmukhi } from "../../lib/gurmukhi-fold";

const BATCH = 500;

async function main() {
  const db = supabaseAdmin();

  const all: { id: number; gurmukhi: string }[] = [];
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await db
      .from("words")
      .select("id, gurmukhi")
      .order("id", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(error.message);
    for (const r of data ?? []) all.push({ id: r.id as number, gurmukhi: r.gurmukhi as string });
    if ((data ?? []).length < PAGE) break;
  }
  console.log(`Populating search_fold for ${all.length} words...`);

  const rows = all.map((w) => ({
    id: w.id,
    gurmukhi: w.gurmukhi,
    search_fold: foldGurmukhi(w.gurmukhi) || null,
  }));

  const t0 = Date.now();
  let done = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error } = await db.from("words").upsert(batch, { onConflict: "id" });
    if (error) {
      console.error(`\nupsert error at row ${i}:`, error.message);
      process.exit(1);
    }
    done += batch.length;
    progress(done, rows.length, t0, "Fold ");
  }
  console.log(`\nDone. ${done} words updated.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
