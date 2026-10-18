/**
 * Build the Bhai Nand Lal Ghazals corpus lines (see ghazals.ts and supabase/migrations/061).
 *
 *   npm run build:nand-lal -- <ghazals.txt> <out.json> [<load.sql>]
 *
 * <ghazals.txt> is the text layer of "Ghazals Bhai Nand Laal Goyaa Complete.pdf" (Google Drive id
 * 1E0Ev6lOwuvTRz41vqw_uC8RzJjMslVSW), from `pdftotext -layout`, converted from GurbaniAkhar to Unicode
 * line by line (Shabad OS gurmukhi-utils toUnicode, run outside this repo as for the scans triage).
 * Writes { "nand_lal_ghazals": Line[] } with Line = { verse_id, ang, line_no, shabad_id, gurmukhi },
 * ready to load into `lines` once 061 has added the source and the shabads rows.
 * With <load.sql>, also writes the SQL that loads them (pipeline/shared/load-sql.ts).
 * Also prints the token counts lib/tokenizer gives, to check the load against.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { tokenize } from "../../lib/tokenizer";
import { linesLoadSql } from "../shared/load-sql";
import { parseGhazals, toLines } from "./ghazals";

const [input, out, sqlOut] = process.argv.slice(2);
if (!input || !out) {
  console.error("usage: build.ts <ghazals.txt> <out.json> [<load.sql>]");
  process.exit(1);
}

const misras = parseGhazals(readFileSync(input, "utf8"));
const lines = toLines(misras);
writeFileSync(out, JSON.stringify({ nand_lal_ghazals: lines }));
if (sqlOut) writeFileSync(sqlOut, linesLoadSql("nand_lal_ghazals", lines).sql);

const tokens = lines.flatMap((l) => tokenize(l.gurmukhi));
const shers = new Map<number, number>();
for (const m of misras) if (m.misra === 2) shers.set(m.ghazal, m.sher);
console.log(
  JSON.stringify({
    lines: lines.length,
    ghazals: shers.size,
    shers: [...shers.values()].reduce((a, b) => a + b, 0),
    tokens: tokens.length,
    distinct: new Set(tokens).size,
  }),
);
console.log("shers per ghazal:", [...shers].map(([g, n]) => `${g}:${n}`).join(" "));
