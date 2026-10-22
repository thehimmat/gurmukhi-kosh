/**
 * Build the Sri Gur Sobha corpus lines (see lines.ts and README.md).
 *
 *   npm run build:gur-sobha -- <extract.jsonl> <out.json> [<load.sql>]
 *
 * <extract.jsonl> is extract.py's output for the ISS 2014 edition (not committed: the edition's
 * typed text is under copyright). Writes { "gur_sobha_iss": Line[] } with
 * Line = { verse_id, ang, line_no, shabad_id, gurmukhi }, and with <load.sql> the SQL that loads them
 * (pipeline/shared/load-sql.ts). Prints the line, shabad and token counts, and checks the edition's
 * verse numbers: each chapter counts from 1 and the running count goes on through the work, so a
 * skip or repeat shows a lost, doubled or misread line.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { tokenize } from "../../lib/tokenizer";
import { linesLoadSql } from "../shared/load-sql";
import { toLines, wordText, type ExtractLine } from "./lines";

const [input, out, sqlOut] = process.argv.slice(2);
if (!input || !out) {
  console.error("usage: build.ts <extract.jsonl> <out.json> [<load.sql>]");
  process.exit(1);
}

const extract: ExtractLine[] = readFileSync(input, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const lines = toLines(extract);
const rows = lines.map(({ verse_id, ang, line_no, shabad_id, gurmukhi }) => ({ verse_id, ang, line_no, shabad_id, gurmukhi }));
writeFileSync(out, JSON.stringify({ gur_sobha_iss: rows }));
if (sqlOut) writeFileSync(sqlOut, linesLoadSql("gur_sobha_iss", rows, wordText).sql);

const DIGITS = "੦੧੨੩੪੫੬੭੮੯";
const toInt = (g: string) => Number([...g].map((d) => DIGITS.indexOf(d)).join(""));
const problems: string[] = [];
// A line where both counts break suggests a lost or doubled verse; where only one does, the
// edition misprinted that number (the other count runs on unbroken).
let bothBroken = 0;
let lastInChapter = 0;
let lastTotal: number | null = null;
let chapter = 0;
for (const l of lines) {
  if (l.chapter !== chapter) {
    chapter = l.chapter;
    lastInChapter = 0;
  }
  if (l.gurmukhi.startsWith("ਇਤਿ")) continue; // the colophon carries the chapter number
  const m = /॥([੦-੯]+)(?:॥([੦-੯]+))?॥$/.exec(l.gurmukhi);
  if (!m) continue;
  const n = toInt(m[1]);
  const total = m[2] ? toInt(m[2]) : null;
  const verseBreaks = n !== lastInChapter + 1;
  const runningBreaks = total !== null && lastTotal !== null && total !== lastTotal + 1;
  if (verseBreaks) problems.push(`ch ${chapter} p ${l.ang}: verse ${n} after ${lastInChapter}: ${l.gurmukhi}`);
  if (runningBreaks) problems.push(`ch ${chapter} p ${l.ang}: running ${total} after ${lastTotal}: ${l.gurmukhi}`);
  if (verseBreaks && runningBreaks) bothBroken++;
  lastInChapter = n;
  if (total !== null) lastTotal = total;
}

const tokens = rows.flatMap((l) => tokenize(wordText(l.gurmukhi)));
console.log(
  JSON.stringify({
    lines: rows.length,
    shabads: new Set(rows.map((l) => l.shabad_id)).size,
    chapters: new Set(lines.map((l) => l.chapter)).size,
    pages: `${rows[0].ang}-${rows.at(-1)!.ang}`,
    lastRunningVerse: lastTotal,
    tokens: tokens.length,
    distinct: new Set(tokens).size,
    numberingBreaks: problems.length,
    bothCountsBroken: bothBroken,
  }),
);
for (const p of problems) console.log("  ", p);
