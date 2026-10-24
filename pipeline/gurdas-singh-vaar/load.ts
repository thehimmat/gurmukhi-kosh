/**
 * Load the built Bhai Gurdas Singh vaar (build.ts's <out.json>) into Supabase with the service key,
 * then refresh the word frequencies, per-corpus and per-writer stats and first-letter keys.
 *
 *   npm run load:gurdas-singh-vaar -- <out.json>
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (in .env.local or the
 * environment). Migration 075 (the source and its shabads) must be applied first. Re-running is a
 * no-op apart from the refreshes.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { readFileSync } from "node:fs";
import { supabaseAdmin } from "../shared/db";
import { loadLines, type LoadDb } from "../shared/load-lines";
import type { LoadLine } from "../shared/load-sql";

const SOURCE = "gurdas_singh_vaar_2008";

async function main() {
  const [input] = process.argv.slice(2);
  if (!input) {
    console.error("usage: load.ts <out.json>");
    process.exit(1);
  }
  const lines = (JSON.parse(readFileSync(input, "utf8")) as Record<string, LoadLine[]>)[SOURCE];
  if (!lines?.length) throw new Error(`${input} has no ${SOURCE} lines`);

  const db = supabaseAdmin();
  const loaded = await loadLines(db as unknown as LoadDb, SOURCE, lines);
  console.log(JSON.stringify(loaded));

  // As pipeline/sggs/ingest.ts: a failed refresh must abort loudly, or the stats stay stale.
  for (const fn of [
    "refresh_word_frequencies",
    "refresh_word_corpus_stats",
    "refresh_word_corpus_writer_stats",
    "refresh_line_first_letters",
  ] as const) {
    const { error } = await db.rpc(fn);
    if (error) {
      console.error(`${fn} FAILED: ${error.message}`);
      console.error(`Re-run it directly (SQL: select ${fn}();) before trusting any frequency.`);
      process.exit(1);
    }
    console.log(`${fn}: ok`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
