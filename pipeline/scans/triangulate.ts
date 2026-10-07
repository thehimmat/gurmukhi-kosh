// Three-way word vote between a typed edition, a scan of the same edition's print,
// and an independent edition (the critical edition), to triage a base text before
// anyone opens the manuscript.
//
// Per word (after the edition fold):
//   typed = print = other      → agreed
//   print = other ≠ typed      → typing slip in the typed text: take the print's word
//   typed = other ≠ print      → OCR noise in the print scan: keep typed
//   typed = print ≠ other      → recension difference: the manuscript decides
//   all different              → the manuscript decides
// Nothing is waved through on edit distance: real variants can be one letter apart.

import { editionFold } from "./collate";

export type WordKind = "typing-slip" | "recension" | "three-way";

export interface WordDiff {
  typed: string;
  print: string;
  ce: string;
  kind: WordKind;
}

export interface Triangulation {
  verdict: "agreed" | "typing-slip" | "manuscript";
  /** Typed text with typing slips corrected (unchanged where the manuscript must decide). */
  text: string;
  words: WordDiff[];
}

const split = (s: string) => s.trim().split(/\s+/).filter(Boolean);

/** Align b's words to a's: for each slot (before a[0], a[0], between, …, after a[n-1]) the b words there. */
function alignWords(a: string[], b: string[]): { at: Array<string | null>; inserted: string[][] } {
  const fa = a.map(editionFold);
  const fb = b.map(editionFold);
  const n = a.length;
  const m = b.length;
  const D = Array.from({ length: n + 1 }, (_, i) => Array.from({ length: m + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= n; i++)
    for (let j = 1; j <= m; j++) D[i][j] = Math.min(D[i - 1][j - 1] + (fa[i - 1] === fb[j - 1] ? 0 : 1), D[i - 1][j] + 1, D[i][j - 1] + 1);
  const at: Array<string | null> = new Array(n).fill(null);
  const inserted: string[][] = Array.from({ length: n + 1 }, () => []);
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && D[i][j] === D[i - 1][j - 1] + (fa[i - 1] === fb[j - 1] ? 0 : 1)) at[--i] = b[--j];
    else if (i > 0 && D[i][j] === D[i - 1][j] + 1) i--;
    else inserted[i].unshift(b[--j]);
  }
  return { at, inserted };
}

const same = (x: string | null, y: string | null) => x !== null && y !== null && editionFold(x) === editionFold(y);

export function triangulate(typed: string, print: string | null, ce: string | null): Triangulation {
  if (print === null || ce === null) return { verdict: "manuscript", text: typed, words: [] };
  const t = split(typed);
  const p = alignWords(t, split(print));
  const c = alignWords(t, split(ce));
  const words: WordDiff[] = [];
  const out: string[] = [];

  const insertions = (slot: number) => {
    // A word the typed text lacks counts only if print and CE both have it at the same place.
    for (const w of p.inserted[slot]) {
      const k = c.inserted[slot].findIndex((x) => same(x, w));
      if (k >= 0) {
        words.push({ typed: "", print: w, ce: c.inserted[slot][k], kind: "typing-slip" });
        out.push(w);
      }
    }
    for (const w of c.inserted[slot]) {
      if (!p.inserted[slot].some((x) => same(x, w))) words.push({ typed: "", print: "", ce: w, kind: "recension" });
    }
  };

  t.forEach((w, i) => {
    insertions(i);
    const pw = p.at[i];
    const cw = c.at[i];
    const tp = same(w, pw);
    const tc = same(w, cw);
    if ((tp && tc) || (tc && !tp)) return void out.push(w); // agreed, or print OCR noise
    if (same(pw, cw)) {
      words.push({ typed: w, print: pw ?? "", ce: cw ?? "", kind: "typing-slip" });
      return void out.push(pw!);
    }
    words.push({ typed: w, print: pw ?? "", ce: cw ?? "", kind: tp ? "recension" : "three-way" });
    out.push(w);
  });
  insertions(t.length);

  const needsMs = words.some((d) => d.kind !== "typing-slip");
  return {
    verdict: needsMs ? "manuscript" : words.length ? "typing-slip" : "agreed",
    text: needsMs ? typed : out.join(" "),
    words,
  };
}
