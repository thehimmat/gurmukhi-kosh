/**
 * Build Chandi Charitar II (the Punjabi-translated Dasam Granth extract) as corpus lines (see
 * lines.ts and README.md).
 *
 *   npm run build:chandi-charitar-2 -- <extract.jsonl> <out.json> [<load.sql>]
 *
 * <extract.jsonl> is extract.py's output (not committed: the typed text may be under copyright).
 * Writes { "chandi_charitar_2_dg": Line[] } with Line = { verse_id, ang, line_no, shabad_id, gurmukhi },
 * and with <load.sql> the SQL that loads them (pipeline/shared/load-sql.ts). Prints the counts and
 * checks the print's two verse counts: the running one goes up by one, the chapter one starts again
 * at ੧ with each chapter, and every line closes on a danda.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { tokenize } from "../../lib/tokenizer";
import { linesLoadSql } from "../shared/load-sql";
import { toLines, type ExtractLine } from "./lines";

const SOURCE = "chandi_charitar_2_dg";
const DIGITS = "੦੧੨੩੪੫੬੭੮੯";
const toInt = (g: string) => Number([...g].map((c) => DIGITS.indexOf(c)).join(""));

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
let running = 0;
let local = 0;
let chapter = 1;
for (const l of lines) {
  if (!/॥$/.test(l.gurmukhi)) problems.push(`p ${l.ang}: no closing danda: ${l.gurmukhi}`);
  if (/^ਇਤਿ /.test(l.gurmukhi)) continue;
  if (l.chapter !== chapter) {
    chapter = l.chapter;
    local = 0;
  }
  const m = /॥([੦-੯]+)॥(?:([੦-੯]+)॥)?$/.exec(l.gurmukhi);
  if (!m) continue;
  const [first, second] = [toInt(m[1]), m[2] ? toInt(m[2]) : null];
  const run = second ?? first; // chapter 1 prints only the one count
  const loc = first;
  if (run !== running + 1) problems.push(`p ${l.ang}: verse ${run} after ${running}`);
  if (chapter > 1 && loc !== local + 1) problems.push(`p ${l.ang}: chapter ${chapter} verse ${loc} after ${local}`);
  running = run;
  local = loc;
}

const tokens = rows.flatMap((l) => tokenize(l.gurmukhi));
const shabads = new Map<number, number>();
for (const l of rows) if (!shabads.has(l.shabad_id)) shabads.set(l.shabad_id, l.ang);
console.log(
  JSON.stringify({
    lines: rows.length,
    shabads: shabads.size,
    chapters: lines.at(-1)?.chapter,
    lastVerse: running,
    pages: `${rows[0].ang}-${rows.at(-1)!.ang}`,
    tokens: tokens.length,
    distinct: new Set(tokens).size,
    problems: problems.length,
  }),
);
console.log("shabad starts (id, ang):", [...shabads].map(([id, ang]) => `(${id}, ${ang})`).join(", "));
for (const p of problems) console.log("  ", p);
