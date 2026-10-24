/**
 * Build Bhai Gurdas Singh's vaar as corpus lines (see lines.ts and README.md).
 *
 *   npm run build:gurdas-singh-vaar -- <extract.jsonl> <out.json> [<load.sql>]
 *
 * <extract.jsonl> is extract.py's output (not committed: the typed text may be under copyright).
 * Writes { "gurdas_singh_vaar_2008": Line[] } with Line = { verse_id, ang, line_no, shabad_id,
 * gurmukhi }, and with <load.sql> the SQL that loads them (pipeline/shared/load-sql.ts). Prints the
 * counts and checks that the pauris run 1, 2, 3 … and that every line closes on a danda.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { tokenize } from "../../lib/tokenizer";
import { linesLoadSql } from "../shared/load-sql";
import { pauriNumber, toLines, type ExtractLine } from "./lines";

const SOURCE = "gurdas_singh_vaar_2008";

const [input, out, sqlOut] = process.argv.slice(2);
if (!input || !out) {
  console.error("usage: build.ts <extract.jsonl> <out.json> [<load.sql>]");
  process.exit(1);
}

const extract: ExtractLine[] = readFileSync(input, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const lines = toLines(extract);
const rows = lines.map(({ verse_id, ang, line_no, shabad_id, gurmukhi }) => ({ verse_id, ang, line_no, shabad_id, gurmukhi }));
writeFileSync(out, JSON.stringify({ [SOURCE]: rows }));
if (sqlOut) writeFileSync(sqlOut, linesLoadSql(SOURCE, rows).sql);

const problems: string[] = [];
let last = 0;
for (const l of lines) {
  if (!/॥$/.test(l.gurmukhi)) problems.push(`p ${l.ang}: no closing danda: ${l.gurmukhi}`);
  const n = pauriNumber(l.gurmukhi);
  if (n === null) continue;
  if (n !== last + 1) problems.push(`p ${l.ang}: pauri ${n} after ${last}`);
  last = n;
}
if (lines.at(-1) && pauriNumber(lines.at(-1)!.gurmukhi) === null) problems.push("the last line closes no pauri");

const tokens = rows.flatMap((l) => tokenize(l.gurmukhi));
const shabads = new Map<number, number>();
for (const l of rows) if (!shabads.has(l.shabad_id)) shabads.set(l.shabad_id, l.ang);
console.log(
  JSON.stringify({
    lines: rows.length,
    shabads: shabads.size,
    lastPauri: last,
    pages: `${rows[0].ang}-${rows.at(-1)!.ang}`,
    tokens: tokens.length,
    distinct: new Set(tokens).size,
    problems: problems.length,
  }),
);
console.log("shabad starts (id, ang):", [...shabads].map(([id, ang]) => `(${id}, ${ang})`).join(", "));
for (const p of problems) console.log("  ", p);
