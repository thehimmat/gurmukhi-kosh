/**
 * Collation CLI (see collate.ts).
 *
 *   npm run scans:collate -- collate <base.txt> <other.txt> <out.json>
 *       Align two editions half-line by half-line and band every pair.
 *   npm run scans:collate -- locate <edition.txt> "<snippet>"
 *       Where does this snippet (e.g. a manuscript page's first words) start?
 *   npm run scans:collate -- page-index <edition.txt> <openings.json> <out.json>
 *       openings.json: [{ "page": 66, "opening": "ਦਰਿਦ੍ਰਸਾਗਰਮਹਿਡੂਬਤੇ" }, ...]
 *   npm run scans:collate -- variants <collation.json> <page-index.json> <out.json>
 *       Definite variants with the manuscript pages to check for each.
 *
 * Inputs are Unicode text; convert legacy-font PDFs first.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { align, buildPageIndex, classify, locate, pagesFor, similarity, splitPadas, type PageIndexEntry } from "./collate";

const read = (f: string) => readFileSync(f, "utf8");
const writeJson = (f: string, v: unknown) => writeFileSync(f, JSON.stringify(v, null, 1) + "\n");

interface Row {
  base: number;
  other: number | null;
  baseText: string;
  baseRef: string | null;
  otherText: string | null;
  band: ReturnType<typeof classify>;
  sim: number;
}

function collate(baseFile: string, otherFile: string, out: string) {
  const base = splitPadas(read(baseFile));
  const other = splitPadas(read(otherFile));
  const rows: Row[] = [];
  const extra: Array<{ other: number; text: string; afterBase: number | null }> = [];
  let lastBase: number | null = null;
  for (const [i, j] of align(base.map((p) => p.text), other.map((p) => p.text))) {
    if (i === null) {
      extra.push({ other: j!, text: other[j!].text, afterBase: lastBase });
      continue;
    }
    lastBase = i;
    const otherText = j === null ? null : other[j].text;
    rows.push({
      base: i,
      other: j,
      baseText: base[i].text,
      baseRef: base[i].ref,
      otherText,
      band: classify(base[i].text, otherText),
      sim: otherText === null ? 0 : Math.round(similarity(base[i].text, otherText)),
    });
  }
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.band] = (counts[r.band] ?? 0) + 1;
  writeJson(out, { base: baseFile, other: otherFile, counts, extraInOther: extra.length, rows, extra });
  console.log(JSON.stringify({ basePadas: base.length, otherPadas: other.length, counts, extraInOther: extra.length }));
}

function locateCmd(edition: string, snippet: string) {
  const padas = splitPadas(read(edition));
  const r = locate(snippet, padas);
  const ctx = padas.slice(Math.max(0, r.index - 1), r.index + 2).map((p, k) => `${r.index - 1 + k}: ${p.text}${p.ref ? ` ॥${p.ref}॥` : ""}`);
  console.log(JSON.stringify({ index: r.index, score: Math.round(r.score) }));
  console.log(ctx.join("\n"));
}

function pageIndex(edition: string, openingsFile: string, out: string) {
  const idx = buildPageIndex(JSON.parse(read(openingsFile)), splitPadas(read(edition)));
  writeJson(out, idx);
  const flagged = idx.filter((e) => e.flag);
  console.log(`${idx.length} pages indexed, ${flagged.length} flagged`);
  for (const e of flagged) console.log(`  p${e.page} ${e.flag} (score ${e.score}): ${e.opening}`);
}

function variants(collationFile: string, indexFile: string, out: string) {
  const { rows } = JSON.parse(read(collationFile)) as { rows: Row[] };
  const index = JSON.parse(read(indexFile)) as PageIndexEntry[];
  const list = rows
    .filter((r) => r.band === "definite")
    .map((r) => ({ pada: r.base, ref: r.baseRef, base: r.baseText, other: r.otherText, sim: r.sim, pages: pagesFor(r.base, index) }));
  writeJson(out, list);
  console.log(`${list.length} definite variants`);
}

const [cmd, ...args] = process.argv.slice(2);
const usage = () => {
  console.error("usage: collate <base> <other> <out> | locate <edition> <snippet> | page-index <edition> <openings> <out> | variants <collation> <index> <out>");
  process.exit(1);
};
if (cmd === "collate" && args.length === 3) collate(args[0], args[1], args[2]);
else if (cmd === "locate" && args.length === 2) locateCmd(args[0], args[1]);
else if (cmd === "page-index" && args.length === 3) pageIndex(args[0], args[1], args[2]);
else if (cmd === "variants" && args.length === 3) variants(args[0], args[1], args[2]);
else usage();
