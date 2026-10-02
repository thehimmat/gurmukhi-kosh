/**
 * Backfills shabads.writer_english / writer_id for SGGS shabads that have none (#86).
 *
 * The ingest used to take a shabad's writer from its first verse only; when that
 * verse carried none, the shabad stayed null even if later verses named a writer.
 * This re-fetches every ang those shabads touch and takes the first verse that
 * names one (shabadWriters). Only rows whose writer is still null are updated.
 *
 * Dry run by default: reports how many null shabads BaniDB can resolve, and
 * samples a few, without writing. Pass --write to apply.
 *
 * If the dry run resolves few or none, BaniDB itself lacks the writer for those
 * shabads, and the fallback is deriving it from the Mahalla heading
 * (number_occurrences role='author'); see #86.
 *
 * Usage (from gurmukhi-kosh project root):
 *   npx tsx pipeline/sggs/backfill-writers.ts            # dry run
 *   npx tsx pipeline/sggs/backfill-writers.ts --write    # apply
 *
 * Requires in .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { supabaseAdmin } from "../shared/db";
import { fetchAng } from "../../lib/banidb";
import { fetchAllRows } from "../../lib/fetch-all-rows";
import { sleep, progress } from "../shared/utils";
import { shabadWriters, type ShabadWriter } from "./shabad-meta";

const DELAY_MS = 150;
const SOURCE_CODE = "sggs_banidb_v2";

async function main() {
  const write = process.argv.includes("--write");
  const db = supabaseAdmin();

  const { data: src, error: srcErr } = await db.from("sources").select("id").eq("code", SOURCE_CODE).single();
  if (srcErr || !src) throw new Error(`source ${SOURCE_CODE} not found: ${srcErr?.message}`);

  const nullShabads = new Set(
    (
      await fetchAllRows<{ id: number }>("null-writer shabads", () =>
        db.from("shabads").select("id").is("writer_english", null).order("id")
      )
    ).map((r) => r.id)
  );

  // Every ang a null shabad has a line on: a shabad can cross an ang boundary,
  // and the verse naming its writer may sit on the later ang.
  const lines = await fetchAllRows<{ id: number; shabad_id: number; ang: number }>("sggs lines", () =>
    db.from("lines").select("id, shabad_id, ang").eq("source_fk", src.id).order("id")
  );
  const targets = new Set<number>();
  const angs = new Set<number>();
  for (const l of lines) {
    if (!nullShabads.has(l.shabad_id)) continue;
    targets.add(l.shabad_id);
    angs.add(l.ang);
  }
  const angList = [...angs].sort((a, b) => a - b);
  console.log(`${targets.size} SGGS shabads without a writer across ${angList.length} angs (${write ? "WRITE" : "dry run"})`);

  const found = new Map<number, ShabadWriter>();
  const t0 = Date.now();
  let fetchErrors = 0;
  for (const [i, ang] of angList.entries()) {
    try {
      const data = await fetchAng(ang, "G");
      for (const [shabadId, w] of shabadWriters(data.page)) {
        if (targets.has(shabadId) && !found.has(shabadId)) found.set(shabadId, w);
      }
    } catch (err) {
      fetchErrors++;
      console.error(`\nang ${ang}:`, err);
    }
    progress(i + 1, angList.length, t0, "Ang ");
    await sleep(DELAY_MS);
  }

  const byWriter = new Map<string, number>();
  for (const w of found.values()) byWriter.set(w.english, (byWriter.get(w.english) ?? 0) + 1);
  console.log(`\n\nResolvable from BaniDB: ${found.size} of ${targets.size}. Fetch errors: ${fetchErrors}`);
  console.table([...byWriter].sort((a, b) => b[1] - a[1]).map(([writer, shabads]) => ({ writer, shabads })));

  if (!write) {
    console.log("Dry run: nothing written. Re-run with --write to apply.");
    return;
  }

  let updated = 0;
  for (const [shabadId, w] of found) {
    const { error } = await db
      .from("shabads")
      .update({ writer_english: w.english, writer_id: w.writerId })
      .eq("id", shabadId)
      .is("writer_english", null);
    if (error) console.error(`shabad ${shabadId}:`, error.message);
    else updated++;
  }
  console.log(`Updated ${updated} shabads.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
