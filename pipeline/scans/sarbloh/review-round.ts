/**
 * Build the review round for Sarbloh half-lines flagged `needsReview` in canon-v0.
 *
 *   npx tsx pipeline/scans/sarbloh/review-round.ts pages <work-dir>
 *       Find each reading's page in the BD print and CE scans; writes <work-dir>/pages.json and
 *       <work-dir>/ocr-pages.txt (pages that need Tesseract word boxes).
 *   (OCR those pages to <work-dir>/tsv/{bd,ce}_<page>.tsv at 300 dpi, --psm 6, `tsv` output.)
 *   npx tsx pipeline/scans/sarbloh/review-round.ts build <work-dir> <out-dir>
 *       Crop each witness; write <out-dir>/rounds/<round-id>.json, list it in <out-dir>/rounds.json,
 *       and put the images under <out-dir>/img and <out-dir>/pages (the viewer in ../review-viewer reads these).
 *
 * Inputs in <work-dir>: items.json (from canon-v0-variants), mscrop_out_*.json (manuscript boxes,
 * as fractions of the page). Scans and OCR text are read from the paths in SOURCES.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { align, locate, splitPadas, type Pada } from "../collate";
import { archivePageUrl, cropFor, findSpan, markDiffs, parseTsv, type Box, type ReviewItem, type ReviewRound, type WitnessView } from "../review";

const SCRATCH = process.env.SARBLOH_SCRATCH ?? "/tmp/claude-0/-home-user-gurmukhi-kosh/a6faba5a-40bf-5eac-a688-2227a944e6d2/scratchpad";
const DATA = "pipeline/scans/data/sarbloh";
const SOURCES = {
  ms: { pdf: `${SCRATCH}/ia/files/sarbloh_1878ce_bhai_chanda_singh.pdf`, archive: "sarbloh_granth_bir" },
  ce: { pdf: `${SCRATCH}/ia/files/sarbloh_critical_edition.pdf`, archive: "sarbloh_critical_edition", text: `${DATA}/ce-core.txt` },
  bd: { pdf: `${SCRATCH}/scans/1kv7Ew4x7NH-nKOMWeVcd8VQ7Skw_mXn0.pdf`, ocrDir: `${SCRATCH}/ia/bdprint_ocr` },
};
const DPI = 300;

interface Item {
  id: string;
  pada: number;
  page: number;
  ms: string;
  bd: string;
  ce: string | null;
  supports: string;
  confidence: string;
  note: string;
  before: string;
  after: string;
}

type PagedPada = Pada & { page: number };
const read = (f: string) => readFileSync(f, "utf8");
const json = <T>(f: string): T => JSON.parse(read(f));

function cePadas(): PagedPada[] {
  const out: PagedPada[] = [];
  for (const chunk of read(SOURCES.ce.text).split(/\[\[p(\d+)\]\]/).slice(1).reduce<Array<[number, string]>>((a, x, k, all) => (k % 2 === 0 ? [...a, [+x, all[k + 1]]] : a), []))
    for (const p of splitPadas(chunk[1])) out.push({ ...p, page: chunk[0] });
  return out;
}

function bdPadas(): PagedPada[] {
  const out: PagedPada[] = [];
  const pages = readdirSync(SOURCES.bd.ocrDir).map((f) => /^ocr_(\d+)\.txt$/.exec(f)).filter(Boolean).map((m) => +m![1]).sort((a, b) => a - b);
  for (const page of pages) if (page >= 47 && !(page >= 383 && page <= 418)) for (const p of splitPadas(read(`${SOURCES.bd.ocrDir}/ocr_${page}.txt`))) out.push({ ...p, page });
  return out;
}

/** For each base half-line, the index of its partner in `other` (or of the nearest aligned neighbour's). */
function partnerIndex(base: string[], other: string[]): number[] {
  const m = new Array<number | null>(base.length).fill(null);
  for (const [i, j] of align(base, other)) if (i !== null && j !== null) m[i] = j;
  let last = 0;
  return m.map((j) => (j === null ? last : (last = j)));
}

/** Pages to look on: where the aligned partner sits, refined by searching a few half-lines either side. */
function candidatePages(reading: string, padas: PagedPada[], at: number): number[] {
  const lo = Math.max(0, at - 12);
  const slice = padas.slice(lo, at + 13);
  const r = locate(reading, slice);
  const page = r.index >= 0 && r.score >= 55 ? slice[r.index].page : padas[Math.min(at, padas.length - 1)].page;
  return [page, page + 1, page - 1];
}

function pages(work: string) {
  const items = json<Item[]>(`${work}/items.json`);
  const base = splitPadas(read(`${DATA}/bd-core.txt`)).map((p) => p.text);
  const ce = cePadas();
  const bd = bdPadas();
  console.log("aligning…");
  const toCe = partnerIndex(base, ce.map((p) => p.text));
  const toBd = partnerIndex(base, bd.map((p) => p.text));
  const found = items.map((it) => ({
    id: it.id,
    ce: it.ce ? candidatePages(it.ce, ce, toCe[it.pada]) : [],
    bd: candidatePages(it.bd, bd, toBd[it.pada]),
  }));
  writeFileSync(`${work}/pages.json`, JSON.stringify(found, null, 1));
  const need = new Set<string>();
  for (const f of found) {
    for (const p of f.ce) need.add(`ce ${p}`);
    for (const p of f.bd) if (!(p >= 383 && p <= 418) && p >= 47) need.add(`bd ${p}`);
  }
  writeFileSync(`${work}/ocr-pages.txt`, [...need].join("\n") + "\n");
  console.log(`${items.length} items; ${need.size} pages to OCR`);
}

const render = (pdf: string, page: number, dpi: number, out: string) => {
  if (!existsSync(`${out}.png`)) execFileSync("pdftoppm", ["-r", String(dpi), "-png", "-f", String(page), "-l", String(page), "-singlefile", pdf, out]);
  return `${out}.png`;
};
const size = (png: string) => {
  const [w, h] = execFileSync("identify", ["-format", "%w %h", png], { encoding: "utf8" }).split(" ").map(Number);
  return { width: w, height: h };
};
/** Crop, scale to `scale`, save as JPEG; returns highlight boxes scaled the same way. */
function cut(png: string, crop: Box, highlights: Box[], scale: number, out: string): Box[] {
  execFileSync("convert", [png, "-crop", `${crop.w}x${crop.h}+${crop.x}+${crop.y}`, "+repage", "-resize", `${Math.round(scale * 100)}%`, "-quality", "82", out]);
  return highlights.map((b) => ({ x: Math.round(b.x * scale), y: Math.round(b.y * scale), w: Math.round(b.w * scale), h: Math.round(b.h * scale) }));
}

function build(work: string, outDir: string) {
  const items = json<Item[]>(`${work}/items.json`);
  const found = new Map(json<Array<{ id: string; ce: number[]; bd: number[] }>>(`${work}/pages.json`).map((f) => [f.id, f]));
  const msBoxes = new Map<string, { page: number; boxes: Box[]; absent?: boolean; note?: string }>();
  for (const f of readdirSync(work).filter((f) => /^mscrop_out_.*\.json$/.test(f))) for (const b of json<any[]>(`${work}/${f}`)) msBoxes.set(b.id, b);
  const renders = `${work}/renders`;
  mkdirSync(renders, { recursive: true });
  mkdirSync(`${outDir}/img`, { recursive: true });
  mkdirSync(`${outDir}/pages`, { recursive: true });

  const printed = (key: "bd" | "ce", it: Item, reading: string | null): WitnessView => {
    if (!reading) return { text: "", note: "Not in this edition." };
    // The candidate page where the words match best.
    let best: { page: number; words: ReturnType<typeof parseTsv>; span: NonNullable<ReturnType<typeof findSpan>> } | null = null;
    for (const page of found.get(it.id)?.[key] ?? []) {
      const tsv = `${work}/tsv/${key}_${page}.tsv`;
      if (!existsSync(tsv)) continue;
      const words = parseTsv(read(tsv));
      const span = findSpan(words, reading);
      if (span && (!best || span.score > best.span.score)) best = { page, words, span };
    }
    const first = found.get(it.id)?.[key]?.[0];
    const link = (page: number) =>
      key === "ce" ? { label: `PDF p. ${page}`, href: archivePageUrl(SOURCES.ce.archive, page) } : { label: `Scan p. ${page}`, href: `pages/bd-${page}.jpg` };
    if (!best) return { text: reading, ...(first ? { page: link(first) } : {}), note: "Could not place the words on the scanned page." };
    const png = render(SOURCES[key].pdf, best.page, DPI, `${renders}/${key}_${best.page}`);
    // A small margin: a larger one slices through the neighbouring lines.
    // Two or three words of context either side (about 300 px at 300 dpi).
    const { crop, highlights } = cropFor(best.words, best.span, size(png), 14, 300);
    const img = `img/${it.id}-${key}.jpg`;
    const view: WitnessView = { text: reading, image: img, highlights: cut(png, crop, highlights, 0.5, `${outDir}/${img}`), page: link(best.page) };
    if (key === "bd" && !existsSync(`${outDir}/pages/bd-${best.page}.jpg`))
      execFileSync("convert", [png, "-resize", "1100x", "-quality", "75", `${outDir}/pages/bd-${best.page}.jpg`]);
    return view;
  };

  const manuscript = (it: Item): WitnessView => {
    const m = msBoxes.get(it.id);
    const page = m?.page ?? it.page;
    const view: WitnessView = {
      // A re-check while cropping can find a line judged absent; the image then shows it.
      text: it.ms || (m?.absent === false ? "(found on re-check: see the image)" : "(not in the manuscript)"),
      page: { label: `PDF p. ${page}`, href: archivePageUrl(SOURCES.ms.archive, page) },
      ...(m?.note ? { note: m.note } : {}),
    };
    if (!m?.boxes?.length) return view;
    // Boxes are fractions of their page; a half-line can run over a page break (boxes then carry their own page).
    const pages = [...new Set(m.boxes.map((b: Box & { page?: number }) => b.page ?? page))];
    const parts: Array<{ file: string; h: number; boxes: Box[] }> = [];
    for (const pg of pages) {
      const png = render(SOURCES.ms.pdf, pg, 150, `${renders}/ms_${pg}`);
      const { width, height } = size(png);
      const px = m.boxes
        .filter((b: Box & { page?: number }) => (b.page ?? page) === pg)
        .map((b) => ({ x: Math.round(b.x * width), y: Math.round(b.y * height), w: Math.round(b.w * width), h: Math.round(b.h * height) }));
      // Context: about one manuscript line above and below, a little to each side.
      const padX = Math.round(width * 0.03);
      const padY = Math.round(height * 0.035);
      // At least 60% of the page wide, so a one-word box still shows its neighbours.
      const minW = Math.round(width * 0.6);
      let x0 = Math.max(0, Math.min(...px.map((b) => b.x)) - padX);
      let x1 = Math.min(width, Math.max(...px.map((b) => b.x + b.w)) + padX);
      if (x1 - x0 < minW) {
        const mid = (x0 + x1) / 2;
        x0 = Math.max(0, Math.round(mid - minW / 2));
        x1 = Math.min(width, x0 + minW);
      }
      const y0 = Math.max(0, Math.min(...px.map((b) => b.y)) - padY);
      const y1 = Math.min(height, Math.max(...px.map((b) => b.y + b.h)) + padY);
      const file = `${renders}/${it.id}-ms-${pg}.png`;
      const boxes = cut(png, { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, px.map((b) => ({ ...b, x: b.x - x0, y: b.y - y0 })), 1, file);
      parts.push({ file, h: y1 - y0, boxes });
    }
    const img = `img/${it.id}-ms.jpg`;
    execFileSync("convert", [...parts.map((p) => p.file), "-background", "white", "-append", "-quality", "82", `${outDir}/${img}`]);
    let offset = 0;
    view.highlights = parts.flatMap((p) => {
      const boxes = p.boxes.map((b) => ({ ...b, y: b.y + offset }));
      offset += p.h;
      return boxes;
    });
    if (pages.length > 1) view.page = { label: `PDF pp. ${pages.join("–")}`, href: archivePageUrl(SOURCES.ms.archive, pages[0]) };
    view.image = img;
    return view;
  };

  const SUPPORTS: Record<string, string> = {
    neither: "The manuscript reads differently from both editions. Which reading should the text have?",
    absent: "This half-line was not found in the manuscript. Keep it?",
    CE: "Low-confidence reading: the manuscript seemed to agree with the critical edition.",
    BD: "Low-confidence reading: the manuscript seemed to agree with Budha Dal.",
    both: "Low-confidence reading: the manuscript seemed to agree with both editions.",
    heading: "Is this a heading or a line of text?",
  };
  const reviewItems: ReviewItem[] = items.map((it) => {
    const witnesses = { ms1878: manuscript(it), budhaDal: printed("bd", it, it.bd), criticalEdition: printed("ce", it, it.ce) };
    // Mark differing words in the printed readings (the manuscript is larivaar, one long token).
    const diffs = markDiffs({ ms: it.ms, bd: it.bd, ...(it.ce ? { ce: it.ce } : {}) });
    witnesses.budhaDal.tokens = diffs.bd;
    if (it.ce) witnesses.criticalEdition.tokens = diffs.ce;
    return {
      id: it.id,
      where: `Half-line ${it.pada.toLocaleString("en")}`,
      question: SUPPORTS[it.supports] ?? "Which reading should the text have?",
      context: { before: it.before, after: it.after },
      witnesses,
      current: { text: it.bd, from: `Budha Dal (kept for now; verdict "${it.supports}", ${it.confidence} confidence${it.note ? `: ${it.note}` : ""})` },
    };
  });
  const round: ReviewRound = {
    id: "sarbloh-canon-v0-review",
    title: "Sarbloh canon v0: flagged half-lines",
    witnesses: [
      { key: "ms1878", label: "1878 Bhai Chanda Singh bir", short: "1878 MS" },
      { key: "budhaDal", label: "Budha Dal print", short: "Budha Dal" },
      { key: "criticalEdition", label: "Critical edition (Jasvant Singh)", short: "Crit. ed." },
    ],
    items: reviewItems,
  };
  // Rounds live side by side under rounds/, listed in rounds.json (newest first) for the viewer.
  mkdirSync(`${outDir}/rounds`, { recursive: true });
  writeFileSync(`${outDir}/rounds/${round.id}.json`, JSON.stringify(round, null, 1));
  const listFile = `${outDir}/rounds.json`;
  const list = (existsSync(listFile) ? json<Array<{ id: string; file: string; title: string }>>(listFile) : []).filter((r) => r.id !== round.id);
  writeFileSync(listFile, JSON.stringify([{ id: round.id, file: `rounds/${round.id}.json`, title: round.title }, ...list], null, 1));
  const n = (k: string) => reviewItems.filter((i) => i.witnesses[k].image).length;
  console.log(`${reviewItems.length} items; images: MS ${n("ms1878")}, BD ${n("budhaDal")}, CE ${n("criticalEdition")}`);
}

const [cmd, ...args] = process.argv.slice(2);
if (cmd === "pages" && args.length === 1) pages(args[0]);
else if (cmd === "build" && args.length === 2) build(args[0], args[1]);
else {
  console.error("usage: pages <work-dir> | build <work-dir> <out-dir>");
  process.exit(1);
}
