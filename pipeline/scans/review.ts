// Review rounds: questions for a person to settle, each shown as two or three witnesses side
// by side (the reading, an image of it on its page, a link to the whole page).
//
// A round is plain JSON, so any later step (probable slips, manuscript-only readings, …) can
// produce one for the same viewer. Images are cropped from page renders; for printed pages
// the words are found through Tesseract's word boxes (`tesseract … tsv`).

import { editionFold, foldLetters } from "./collate";

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface WitnessView {
  /** The reading as this witness has it (as transcribed or OCR'd). */
  text: string;
  /** The reading split into words, marking those another witness lacks (see markDiffs). */
  tokens?: Array<{ text: string; differs: boolean }>;
  /** Image of the reading on its page, relative to the round file. */
  image?: string;
  /** Boxes around the reading inside the image, in image pixels. */
  highlights?: Box[];
  /** Where to see the whole page. */
  page?: { label: string; href: string };
  note?: string;
}

export interface ReviewItem {
  id: string;
  /** Where this is in the text, e.g. "half-line 9,315 (verse 42)". */
  where: string;
  /** What needs deciding, in one sentence. */
  question: string;
  /** Neighbouring half-lines, to orient. */
  context?: { before?: string; after?: string };
  witnesses: Record<string, WitnessView>;
  /** What the text currently has and why. */
  current?: { text: string; from: string };
}

export interface ReviewRound {
  id: string;
  title: string;
  /** Witness keys in display order, with their labels. */
  witnesses: Array<{ key: string; label: string; short: string }>;
  items: ReviewItem[];
}

export interface OcrWord {
  text: string;
  left: number;
  top: number;
  width: number;
  height: number;
  /** block.paragraph.line */
  line: string;
}

/** Word boxes from Tesseract TSV output. */
export function parseTsv(tsv: string): OcrWord[] {
  const out: OcrWord[] = [];
  for (const row of tsv.split("\n").slice(1)) {
    const c = row.split("\t");
    if (c[0] !== "5" || !c[11]?.trim()) continue;
    out.push({ text: c[11].trim(), left: +c[6], top: +c[7], width: +c[8], height: +c[9], line: `${c[2]}.${c[3]}.${c[4]}` });
  }
  return out;
}

/**
 * The run of page words that best matches a reading (spelling and word division aside), or null
 * if nothing on the page comes close. Approximate substring match on edition-folded letters.
 */
export function findSpan(words: OcrWord[], reading: string, minScore = 60): { start: number; end: number; score: number } | null {
  const pat = [...foldLetters(reading)];
  const page: Array<{ ch: string; word: number }> = [];
  words.forEach((w, k) => [...editionFold(w.text)].forEach((ch) => page.push({ ch, word: k })));
  const m = pat.length;
  const n = page.length;
  if (!m || !n) return null;
  // D[i][j]: cost of matching pat[0..i) ending at page[0..j), free start on the page.
  const D = Array.from({ length: m + 1 }, (_, i) => new Int32Array(n + 1).fill(i === 0 ? 0 : i));
  for (let i = 1; i <= m; i++) {
    D[i][0] = i;
    for (let j = 1; j <= n; j++) D[i][j] = Math.min(D[i - 1][j - 1] + (pat[i - 1] === page[j - 1].ch ? 0 : 1), D[i - 1][j] + 1, D[i][j - 1] + 1);
  }
  let end = 1;
  for (let j = 1; j <= n; j++) if (D[m][j] < D[m][end]) end = j;
  const score = Math.round(100 * (1 - D[m][end] / m));
  if (score < minScore) return null;
  let i = m;
  let j = end;
  let first = end;
  while (i > 0) {
    if (j > 0 && D[i][j] === D[i - 1][j - 1] + (pat[i - 1] === page[j - 1].ch ? 0 : 1)) (first = j), i--, j--;
    else if (D[i][j] === D[i - 1][j] + 1) i--;
    else (first = j), j--;
  }
  return { start: page[first - 1].word, end: page[end - 1].word, score };
}

const union = (ws: OcrWord[]) => {
  const x = Math.min(...ws.map((w) => w.left));
  const y = Math.min(...ws.map((w) => w.top));
  return { x, y, w: Math.max(...ws.map((w) => w.left + w.width)) - x, h: Math.max(...ws.map((w) => w.top + w.height)) - y };
};

/**
 * Crop the lines a span touches, and box the span itself inside the crop. With `contextX`, keep only
 * that much of the lines either side of the span (whole lines are hard to read when scaled down).
 */
export function cropFor(
  words: OcrWord[],
  span: { start: number; end: number },
  page: { width: number; height: number },
  pad: number,
  contextX?: number,
): { crop: Box; highlights: Box[] } {
  const spanWords = words.slice(span.start, span.end + 1);
  const lines = [...new Set(spanWords.map((w) => w.line))];
  const all = union(words.filter((w) => lines.includes(w.line)));
  if (contextX !== undefined) {
    const s = union(spanWords);
    const left = Math.max(all.x, s.x - contextX);
    const right = Math.min(all.x + all.w, s.x + s.w + contextX);
    all.x = left;
    all.w = right - left;
  }
  const x = Math.max(0, all.x - pad);
  const y = Math.max(0, all.y - pad);
  const crop = { x, y, w: Math.min(page.width, all.x + all.w + pad) - x, h: Math.min(page.height, all.y + all.h + pad) - y };
  const highlights = lines.map((l) => {
    const b = union(spanWords.filter((w) => w.line === l));
    return { x: b.x - x, y: b.y - y, w: b.w, h: b.h };
  });
  return { crop, highlights };
}

/** Split each reading into words, marking those another reading lacks (spelling and word division aside). */
export function markDiffs(readings: Record<string, string>): Record<string, Array<{ text: string; differs: boolean }>> {
  const folded = Object.fromEntries(Object.entries(readings).map(([k, r]) => [k, foldLetters(r)]));
  return Object.fromEntries(
    Object.entries(readings).map(([k, r]) => [
      k,
      r.trim().split(/\s+/).filter(Boolean).map((text) => {
        const f = editionFold(text);
        return { text, differs: f !== "" && Object.keys(readings).some((o) => o !== k && !folded[o].includes(f)) };
      }),
    ]),
  );
}

/** The archive.org reader at a PDF page (its leaves count from 0). */
export function archivePageUrl(identifier: string, pdfPage: number): string {
  return `https://archive.org/details/${identifier}/page/n${pdfPage - 1}/mode/1up`;
}
