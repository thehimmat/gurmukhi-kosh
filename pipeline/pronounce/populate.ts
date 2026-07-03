/**
 * Populate words.ipa_display (faithful display IPA) from each word's Gurmukhi.
 *
 * Usage (from gurmukhi-kosh project root):
 *   npm run pronounce -- --word-set=japji   # just the pilot set
 *   npm run pronounce                         # all words
 *
 * Requires in .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Idempotent: recomputes and overwrites ipa_display each run.
 *
 * NOTE: ipa_display is rule_derived from gurmukhi-rule-builder's phoneme rules
 * and is expected to be refined over time. It is distinct from the lossy
 * phonetic_ipa fuzzy-match key owned by gurmukhi-voice-search.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "../shared/db";
import { getArg, progress } from "../shared/utils";
import { fetchWordSet } from "../shared/word-sets";
import { gurmukhiToDisplayIPA } from "../../lib/pronounce/gurmukhi-to-ipa";

const BATCH = 500;

async function getScopeWords(
  db: SupabaseClient,
  wordSet: string | undefined
): Promise<{ id: number; gurmukhi: string }[]> {
  if (wordSet) {
    const members = await fetchWordSet(db, wordSet);
    return members.map((m) => ({ id: m.word_id, gurmukhi: m.gurmukhi }));
  }
  const all: { id: number; gurmukhi: string }[] = [];
  const PAGE = 1000;
  let offset = 0;
  for (;;) {
    const { data, error } = await db
      .from("words")
      .select("id, gurmukhi")
      .order("id", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(error.message);
    const batch = data ?? [];
    for (const r of batch) all.push({ id: r.id as number, gurmukhi: r.gurmukhi as string });
    if (batch.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

async function main() {
  const wordSet = getArg("word-set") || undefined;
  const db = supabaseAdmin();

  const words = await getScopeWords(db, wordSet);
  console.log(
    `Populating ipa_display for ${words.length} words ${wordSet ? `(set '${wordSet}')` : "(all)"}...`
  );

  const rows = words.map((w) => ({
    id: w.id,
    gurmukhi: w.gurmukhi,
    ipa_display: gurmukhiToDisplayIPA(w.gurmukhi),
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
    progress(done, rows.length, t0, "IPA ");
  }
  console.log(`\nDone. ${done} words updated.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
