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
 *   npm run scans:collate -- assemble <base.txt> <resolve-dir> <out-prefix>
 *       Join item batches (var_*.json, spot.json) with manuscript verdicts (out_*.json) and write
 *       <out-prefix>.txt (canonical text), <out-prefix>.json (the same, one entry per base half-line),
 *       <out-prefix>-variants.json and <out-prefix>-summary.json.
 *   npm run scans:collate -- triangulate <typed.txt> <print.txt> <other.txt> <out.json>
 *       Word-level vote between a typed edition, an OCR of its print and another edition:
 *       agreed / typing slip (auto-fixed) / manuscript (recension or three-way difference).
 *   npm run scans:collate -- apparatus <base.txt> <collation.json> <resolve-dir> <out.json> [research.json] [review.json]
 *       Where the other witnesses differ from the canonical text, with notes on the significant places.
 *       research.json / review.json: { "<half-line>": "note" }; a research entry may instead be
 *       { "note": "...", "kind": "not-in-ms", "readings": {...} } to correct a misaligned check.
 *   npm run scans:collate -- apply-slips <canon.json> <triangulation.json> <variants.json> <out-prefix>
 *       Correct the typing slips in an assembled text, except where the manuscript already ruled;
 *       writes <out-prefix>.txt and <out-prefix>-slips.json.
 *
 * Inputs are Unicode text; convert legacy-font PDFs first.
 */

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { applySlips, assemble, type CanonicalPada, type Verdict } from "./assemble";
import { buildApparatus, type ResearchNote } from "./apparatus";
import { triangulate } from "./triangulate";
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

/** Manuscript verdicts (out_*.json) joined with their items (var_*.json, spot.json); spot checks apart. */
function loadVerdicts(dir: string): { verdicts: Verdict[]; spot: Array<Verdict & { id: string }> } {
  const items = new Map<string, { pada: number; bd: string; ce: string | null }>();
  const verdicts: Verdict[] = [];
  const spot: Array<Verdict & { id: string }> = [];
  for (const f of readdirSync(dir).filter((f) => /^(var_\d+|spot)\.json$/.test(f)))
    for (const it of JSON.parse(read(`${dir}/${f}`))) items.set(it.id, it);
  for (const f of readdirSync(dir).filter((f) => /^out_.*\.json$/.test(f))) {
    for (const o of JSON.parse(read(`${dir}/${f}`))) {
      const it = items.get(o.id);
      if (!it) continue;
      const v: Verdict = { pada: it.pada, bd: it.bd, ce: it.ce, ms: o.ms ?? "", supports: o.supports, confidence: o.confidence, page: o.page ?? null, note: o.note || undefined };
      if (o.id.startsWith("s")) spot.push({ ...v, id: o.id });
      else verdicts.push(v);
    }
  }
  return { verdicts, spot };
}

function assembleCmd(baseFile: string, dir: string, prefix: string) {
  const { verdicts, spot } = loadVerdicts(dir);
  const { text, variants } = assemble(splitPadas(read(baseFile)), verdicts);
  writeJson(`${prefix}.json`, text);
  writeFileSync(`${prefix}.txt`, text.map((p) => `${p.text} ॥${p.ref ? ` ${p.ref} ॥` : ""}`).join("\n") + "\n");
  writeJson(`${prefix}-variants.json`, variants);
  const tally = (xs: Array<{ supports: string }>) => xs.reduce<Record<string, number>>((t, x) => ((t[x.supports] = (t[x.supports] ?? 0) + 1), t), {});
  const summary = {
    halfLines: text.length,
    checked: verdicts.length,
    supports: tally(verdicts),
    needsReview: variants.filter((v) => v.needsReview).length,
    spotCheck: { checked: spot.length, supports: tally(spot) },
  };
  writeJson(`${prefix}-summary.json`, summary);
  console.log(JSON.stringify(summary));
}

function triangulateCmd(typedFile: string, printFile: string, otherFile: string, out: string) {
  const typed = splitPadas(read(typedFile));
  const pair = (file: string) => {
    const other = splitPadas(read(file));
    const m = new Array<string | null>(typed.length).fill(null);
    for (const [i, j] of align(typed.map((p) => p.text), other.map((p) => p.text))) if (i !== null && j !== null) m[i] = other[j].text;
    return m;
  };
  const print = pair(printFile);
  const other = pair(otherFile);
  const rows = typed.map((p, i) => ({ pada: i, ref: p.ref, ...triangulate(p.text, print[i], other[i]) }));
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.verdict] = (counts[r.verdict] ?? 0) + 1;
  const n = (kind: string) => rows.reduce((t, r) => t + r.words.filter((w) => w.kind === kind).length, 0);
  const words = { "typing-slip": n("typing-slip"), "probable-slip": n("probable-slip"), recension: n("recension"), "three-way": n("three-way") };
  writeJson(out, { counts, words, rows: rows.filter((r) => r.verdict !== "agreed") });
  console.log(JSON.stringify({ padas: rows.length, counts, words }));
}

function applySlipsCmd(canonFile: string, triFile: string, variantsFile: string, prefix: string) {
  const canon = JSON.parse(read(canonFile)) as CanonicalPada[];
  const { rows } = JSON.parse(read(triFile)) as { rows: Array<{ pada: number; verdict: string; text: string; words: Array<{ typed: string; print: string; kind: string }> }> };
  const ruled = new Set((JSON.parse(read(variantsFile)) as Array<{ pada: number }>).map((v) => v.pada));
  const { text, fixes } = applySlips(canon, rows.filter((r) => r.words.some((w) => w.kind === "typing-slip")), ruled);
  writeJson(`${prefix}.json`, text);
  writeFileSync(`${prefix}.txt`, text.map((p) => `${p.text} ॥${p.ref ? ` ${p.ref} ॥` : ""}`).join("\n") + "\n");
  writeJson(`${prefix}-slips.json`, fixes);
  console.log(JSON.stringify({ halfLines: text.length, padasFixed: new Set(fixes.map((f) => f.pada)).size, wordsFixed: fixes.length }));
}

function apparatusCmd(baseFile: string, collationFile: string, dir: string, out: string, researchFile?: string, reviewFile?: string) {
  const { verdicts, spot } = loadVerdicts(dir);
  const notes = <T>(f?: string) => (f ? (JSON.parse(read(f)) as Record<number, T>) : {});
  const entries = buildApparatus({
    base: splitPadas(read(baseFile)),
    collation: (JSON.parse(read(collationFile)) as { rows: Row[] }).rows,
    // A spot check counts only where the manuscript showed a real difference.
    verdicts: [...verdicts, ...spot.filter((s) => s.supports !== "both" && !verdicts.some((v) => v.pada === s.pada))],
    research: notes<ResearchNote>(researchFile),
    reviewNotes: notes<string>(reviewFile),
  });
  writeJson(out, entries);
  const count = (pick: (e: (typeof entries)[number]) => string) => entries.reduce<Record<string, number>>((t, e) => ((t[pick(e)] = (t[pick(e)] ?? 0) + 1), t), {});
  console.log(JSON.stringify({ entries: entries.length, significant: entries.filter((e) => e.significant).length, kinds: count((e) => e.kind), checked: count((e) => String(e.checked)) }));
}

const [cmd, ...args] = process.argv.slice(2);
const usage = () => {
  console.error("usage: collate <base> <other> <out> | locate <edition> <snippet> | page-index <edition> <openings> <out> | variants <collation> <index> <out> | assemble <base> <resolve-dir> <out-prefix> | triangulate <typed> <print> <other> <out> | apparatus <base> <collation> <resolve-dir> <out> [research] [review] | apply-slips <canon> <tri> <variants> <out-prefix>");
  process.exit(1);
};
if (cmd === "collate" && args.length === 3) collate(args[0], args[1], args[2]);
else if (cmd === "locate" && args.length === 2) locateCmd(args[0], args[1]);
else if (cmd === "page-index" && args.length === 3) pageIndex(args[0], args[1], args[2]);
else if (cmd === "variants" && args.length === 3) variants(args[0], args[1], args[2]);
else if (cmd === "assemble" && args.length === 3) assembleCmd(args[0], args[1], args[2]);
else if (cmd === "triangulate" && args.length === 4) triangulateCmd(args[0], args[1], args[2], args[3]);
else if (cmd === "apparatus" && args.length >= 4 && args.length <= 6) apparatusCmd(args[0], args[1], args[2], args[3], args[4], args[5]);
else if (cmd === "apply-slips" && args.length === 4) applySlipsCmd(args[0], args[1], args[2], args[3]);
else usage();
