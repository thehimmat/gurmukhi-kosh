/**
 * Shackle lookups loader — Phase 1.
 *
 * Loads the two controlled-vocabulary tables shipped with the extraction so the
 * main ingest can keep citation sigla and abbreviation codes as FKs rather than
 * flattening the book's own expansions away:
 *   references.json .sigla   → citation_sigla   (100 AG citation sigla)
 *   mappings.json  categories → dict_mappings   (pos/case/language/sign/... vocab)
 *
 * Idempotent + takedown-proof: both tables are scoped by source_code='shackle'
 * and wiped + reloaded on each run.
 *
 * Usage: npm run ingest:shackle:lookups
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import * as fs from "fs";
import { supabaseAdmin } from "../shared/db";

const SOURCE_CODE = "shackle";
const DATA_DIR = "pipeline/shackle/data";

type Sigla = Record<string, { title?: string; agPages?: string; dagger?: boolean }>;

function readJson<T>(path: string): T {
  if (!fs.existsSync(path)) {
    console.error(`Not found: ${path}. Copy the handoff bundle into ${DATA_DIR}/.`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(path, "utf-8")) as T;
}

async function main() {
  const db = supabaseAdmin();

  // --- citation_sigla (references.json .sigla) ---
  const refs = readJson<{ sigla: Sigla }>(`${DATA_DIR}/references.json`);
  const siglaRows = Object.entries(refs.sigla).map(([siglum, v]) => ({
    source_code: SOURCE_CODE,
    siglum,
    title: v.title ?? null,
    ag_pages: v.agPages ?? null,
    dagger: v.dagger ?? false,
  }));

  // --- dict_mappings (mappings.json categories) ---
  const maps = readJson<Record<string, unknown>>(`${DATA_DIR}/mappings.json`);
  const mapRows: { source_code: string; category: string; key: string; expansion: string }[] = [];
  for (const [category, value] of Object.entries(maps)) {
    if (category.startsWith("_")) continue; // _source
    if (typeof value !== "object" || value === null) continue;
    for (const [key, expansion] of Object.entries(value as Record<string, unknown>)) {
      if (key.startsWith("_")) continue; // _note
      if (typeof expansion !== "string") continue;
      mapRows.push({ source_code: SOURCE_CODE, category, key, expansion });
    }
  }

  console.log(`citation_sigla: ${siglaRows.length} rows | dict_mappings: ${mapRows.length} rows`);

  // Idempotent reload, scoped to this source.
  const delSig = await db.from("citation_sigla").delete().eq("source_code", SOURCE_CODE);
  if (delSig.error) throw new Error(`citation_sigla delete: ${delSig.error.message}`);
  const delMap = await db.from("dict_mappings").delete().eq("source_code", SOURCE_CODE);
  if (delMap.error) throw new Error(`dict_mappings delete: ${delMap.error.message}`);

  const insSig = await db.from("citation_sigla").insert(siglaRows);
  if (insSig.error) throw new Error(`citation_sigla insert: ${insSig.error.message}`);
  const insMap = await db.from("dict_mappings").insert(mapRows);
  if (insMap.error) throw new Error(`dict_mappings insert: ${insMap.error.message}`);

  console.log("Lookups loaded.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
