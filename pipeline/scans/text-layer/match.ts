import type { ScanPage, ScanUnit } from "./read";

export type LineRef = { page: number; n: number };

// A source line shorter than this (in code points, spaces left out) is only linked when it is a
// whole page line: a two-letter fragment would match almost anything.
const MIN_FRAGMENT = 4;

const norm = (s: string) => s.normalize("NFC").replace(/\s+/g, " ").trim();
const letters = (s: string) => [...s.replace(/\s/g, "")].length;

/**
 * The transcription lines a translation unit was taken from. The units name only pages; their
 * `source` is the OCR text copied line by line (99.5% of lines verbatim, the rest a part of a line
 * split between two units). Walks the source lines in order through the unit's pages, never going
 * back, so a line repeated on the page (ਪ੍ਰਸ਼ਨ।) links to the right one. A line that can't be found
 * is skipped.
 */
export function matchUnitLines(unit: ScanUnit, pages: Map<number, ScanPage>): LineRef[] {
  const seq = [...unit.pages]
    .sort((a, b) => a - b)
    .flatMap((p) => (pages.get(p)?.lines ?? []).map((l) => ({ page: p, n: l.n, text: norm(l.text) })));
  const out: LineRef[] = [];
  let cursor = 0;
  for (const raw of unit.source.split("\n")) {
    const s = norm(raw);
    if (!s) continue;
    let at = seq.findIndex((l, i) => i >= cursor && l.text === s);
    if (at < 0 && letters(s) >= MIN_FRAGMENT) at = seq.findIndex((l, i) => i >= cursor && l.text.includes(s));
    if (at < 0) continue;
    const ref = { page: seq[at].page, n: seq[at].n };
    if (!out.some((r) => r.page === ref.page && r.n === ref.n)) out.push(ref);
    cursor = at;
  }
  return out;
}
