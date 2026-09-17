/**
 * Rebuilds number_occurrences (migration 032) from lines.gurmukhi.
 *
 * Numerals are not words — lib/tokenizer.ts drops them — so this pass is the
 * only thing that makes a number searchable. It reads every line, runs
 * extractNumerals over it, and writes one row per numeral with the role that
 * separates heading numbers (ਮਹਲਾ ੫, ਘਰੁ ੨) from the verse tallies (॥੧॥)
 * that dominate the text.
 *
 *   npm run ingest:numbers              # rebuild from scratch
 *   npm run ingest:numbers -- --dry-run # classify and report, write nothing
 *
 * Re-runnable and idempotent: it clears the table first, and the unique
 * (line_id, char_start) key means a partial re-run cannot double-count. Run it
 * after any corpus ingest, since new lines carry new numerals.
 *
 * Requires in .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { supabaseAdmin } from "../shared/db";
import { getArg, progress } from "../shared/utils";
import { extractNumerals, type NumeralRole } from "../../lib/gurmukhi-numerals";

const READ_PAGE = 1000;
const WRITE_CHUNK = 1000;

type Row = {
  line_id: number;
  value: number;
  role: NumeralRole;
  keyword: string | null;
  char_start: number;
  char_end: number;
};

async function main() {
  const dryRun = getArg("dry-run") !== undefined;
  const db = supabaseAdmin();

  const { count: totalLines, error: countErr } = await db
    .from("lines")
    .select("id", { count: "exact", head: true });
  if (countErr) throw new Error(`line count: ${countErr.message}`);

  console.log(
    `Scanning ${(totalLines ?? 0).toLocaleString()} lines for numerals${dryRun ? " (dry run)" : ""}...`
  );

  if (!dryRun) {
    // Full rebuild: the roles are derived, so the table is a cache of the
    // classifier's current output, never a store of edits.
    const { error } = await db
      .from("number_occurrences")
      .delete()
      .gte("id", 0);
    if (error) throw new Error(`clear number_occurrences: ${error.message}`);
  }

  const byRole = new Map<NumeralRole, number>();
  let scanned = 0;
  let written = 0;
  let pending: Row[] = [];
  const t0 = Date.now();

  async function flush(force = false) {
    while (pending.length >= WRITE_CHUNK || (force && pending.length > 0)) {
      const chunk = pending.slice(0, WRITE_CHUNK);
      pending = pending.slice(WRITE_CHUNK);
      if (!dryRun) {
        const { error } = await db
          .from("number_occurrences")
          .upsert(chunk, { onConflict: "line_id,char_start" });
        // A dropped chunk is silent data loss of exactly the kind
        // pipeline/verify/occurrences.ts exists to catch — fail the run.
        if (error) throw new Error(`insert numerals: ${error.message}`);
      }
      written += chunk.length;
    }
  }

  // Paged read with a stable order, per lib/fetch-all-rows' warning about the
  // silent 1000-row cap. Streamed rather than accumulated: the corpus is
  // ~120k lines and only the counts need to survive the loop.
  for (let from = 0; ; from += READ_PAGE) {
    const { data, error } = await db
      .from("lines")
      .select("id, gurmukhi")
      .order("id")
      .range(from, from + READ_PAGE - 1);
    if (error) throw new Error(`read lines: ${error.message}`);
    const batch = (data ?? []) as Array<{ id: number; gurmukhi: string }>;

    for (const line of batch) {
      scanned++;
      for (const n of extractNumerals(line.gurmukhi)) {
        byRole.set(n.role, (byRole.get(n.role) ?? 0) + 1);
        pending.push({
          line_id: line.id,
          value: n.value,
          role: n.role,
          keyword: n.keyword,
          char_start: n.start,
          char_end: n.end,
        });
      }
    }

    await flush();
    progress(scanned, totalLines ?? scanned, t0, "Lines ");
    if (batch.length < READ_PAGE) break;
  }

  await flush(true);

  console.log(`\n\nScanned ${scanned.toLocaleString()} lines.`);
  console.log(`${dryRun ? "Would write" : "Wrote"} ${written.toLocaleString()} numeral rows:`);
  for (const [role, n] of [...byRole.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${role.padEnd(15)} ${n.toLocaleString().padStart(8)}`);
  }

  if (!dryRun) {
    const { count, error } = await db
      .from("number_occurrences")
      .select("id", { count: "exact", head: true });
    if (error) throw new Error(`verify count: ${error.message}`);
    if (count !== written) {
      throw new Error(
        `Verification failed: wrote ${written} rows but the table holds ${count}.`
      );
    }
    console.log(`\nVerified: number_occurrences holds ${count.toLocaleString()} rows.`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
