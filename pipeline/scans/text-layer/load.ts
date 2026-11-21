/**
 * Load one text from a checkout of thehimmat/scan-text-layer into migration 093's tables, for the
 * curator's scan viewer (/admin/scans). Replaces whatever was loaded for that slug before.
 *
 *   npm run load:scan-text -- <scan-text-layer dir> <slug> "<title>" [--dry-run]
 *
 * Pages come from out/<slug>/final/ when it exists (manuscripts, after adjudication), otherwise
 * out/<slug>/pages/. Units come from translations/<slug>.jsonl when it exists (a text with no
 * translation yet loads its pages alone). --dry-run prints the counts and writes nothing.
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (in .env.local or the
 * environment), and migration 093.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parsePage } from "./read";
import { buildRows } from "./rows";

const WRITE = 500;

export function readText(dir: string, slug: string) {
  const final = join(dir, "out", slug, "final");
  const pagesDir = existsSync(final) ? final : join(dir, "out", slug, "pages");
  if (!existsSync(pagesDir)) throw new Error(`no transcription for ${slug} under ${dir}/out`);
  const pages = readdirSync(pagesDir)
    .filter((f) => /^\d{4}\.json$/.test(f))
    .sort()
    .map((f) => parsePage(JSON.parse(readFileSync(join(pagesDir, f), "utf8"))));
  const unitsFile = join(dir, "translations", `${slug}.jsonl`);
  const units = existsSync(unitsFile)
    ? readFileSync(unitsFile, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l))
    : [];
  return { pages, units };
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const [dir, slug, title] = args.filter((a) => a !== "--dry-run");
  if (!dir || !slug || !title) {
    console.error('usage: load.ts <scan-text-layer dir> <slug> "<title>" [--dry-run]');
    process.exit(1);
  }
  const rows = buildRows({ slug, title, ...readText(dir, slug) });
  const linked = new Set(rows.unitLines.map((l) => l.seq)).size;
  console.log(
    JSON.stringify({
      pages: rows.pages.length,
      lines: rows.lines.length,
      units: rows.units.length,
      unitsWithLines: linked,
      unitLines: rows.unitLines.length,
    }),
  );
  if (dryRun) return;

  const { supabaseAdmin } = await import("../../shared/db");
  const db = supabaseAdmin();
  const fail = (what: string, e: { message: string } | null) => {
    if (e) throw new Error(`${what}: ${e.message}`);
  };
  // Everything under the text cascades.
  fail("delete", (await db.from("scan_texts").delete().eq("slug", slug)).error);
  fail("scan_texts", (await db.from("scan_texts").insert(rows.text)).error);
  for (const [table, list] of [
    ["scan_pages", rows.pages],
    ["scan_lines", rows.lines],
    ["scan_units", rows.units],
    ["scan_unit_lines", rows.unitLines],
  ] as const) {
    for (let i = 0; i < list.length; i += WRITE) {
      fail(table, (await db.from(table).insert(list.slice(i, i + WRITE) as object[])).error);
    }
    console.log(`${table}: ${list.length}`);
  }
}

if (process.argv[1]?.endsWith("load.ts")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
