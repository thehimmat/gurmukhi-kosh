// Three-way word vote between a typed edition, a scan of the same edition's print,
// and an independent edition (the critical edition), to triage a base text before
// anyone opens the manuscript.
//
// Per word, first on the edition fold, then on the consonant skeleton (vowel signs,
// nasals and vowel carriers dropped, ਵ/ਬ merged):
//   print = other ≠ typed      → typing slip in the typed text: take the print's word
//                                (only suggested if they agree on consonants alone, or the OCR word is malformed)
//   typed = other ≠ print      → OCR noise in the print scan: keep typed
//   same skeleton everywhere   → spelling only (editions differ in medial vowels): keep typed
//   typed = print ≠ other      → recension difference: the manuscript decides
//   all different              → the manuscript decides
// Nothing is waved through on edit distance: real variants can be one consonant apart.
// Both scans went through the same OCR engine, so losses it makes in both (nasals, subscripts)
// and differences of word division are not counted as slips.

import { editionFold, isHeading } from "./collate";

/**
 * typing-slip: print and CE agree exactly against the typed text; applied.
 * probable-slip: they agree only on consonants, or the OCR word is malformed; suggested, not applied.
 */
export type WordKind = "typing-slip" | "probable-slip" | "recension" | "three-way";

export interface WordDiff {
  typed: string;
  print: string;
  ce: string;
  kind: WordKind;
}

export interface Triangulation {
  verdict: "agreed" | "typing-slip" | "manuscript" | "heading";
  /** Typed text with typing slips corrected; words the manuscript must decide stay as typed. */
  text: string;
  words: WordDiff[];
}

const split = (s: string) => s.trim().split(/\s+/).filter(Boolean);

/** Consonant skeleton: what survives when only the vowel spelling differs. */
function skeleton(word: string): string {
  // OCR writes the subscript ra of ਪ੍ਰਭ as ਪਰ੍ਭ, so read ਰ੍ as ੍ਰ first.
  return editionFold(word.replace(/ਰ੍/g, "੍ਰ"))
    .replace(/ਵ/g, "ਬ")
    .replace(/[ਾਿੀੁੂੇੈੋੌੰਂੱ਼੍ਅਆਇਈਉਊਏਐਓਔੲੳ]/g, "");
}

/** Align b's words to a's: for each slot (before a[0], a[0], between, …, after a[n-1]) the b words there. */
function alignWords(a: string[], b: string[]): { at: Array<string | null>; inserted: string[][] } {
  const fa = a.map(skeleton);
  const fb = b.map(skeleton);
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

/**
 * Skeleton with non-initial ਰ dropped: the fold reads subscript ra as aunkar (which the
 * skeleton drops), editions write ਛਤ੍ਰ/ਛਤਰ and ਪਰਬਤ/ਪ੍ਰਬਤ, and the OCR loses ra (ਪ੍ਜਾ).
 */
const loose = (word: string) => skeleton(word).replace(/(?<=.)ਰ/gu, "");
const joined = (words: string[]) => words.map(loose).join("");

/**
 * Compare two half-lines letter by letter (by default on the loose skeleton), ignoring word division.
 * Returns the words of `a` that contain (or border) an edit, and whether `b` has letters `a` lacks.
 */
function letterDiff(a: string[], b: string[], key: (w: string) => string = loose): { touched: Set<string>; inserts: boolean } {
  const x: Array<{ ch: string; word: number }> = [];
  a.forEach((w, k) => [...key(w)].forEach((ch) => x.push({ ch, word: k })));
  const y = b.flatMap((w) => [...key(w)]);
  const n = x.length;
  const m = y.length;
  const D = Array.from({ length: n + 1 }, (_, i) => Array.from({ length: m + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= n; i++)
    for (let j = 1; j <= m; j++) D[i][j] = Math.min(D[i - 1][j - 1] + (x[i - 1].ch === y[j - 1] ? 0 : 1), D[i - 1][j] + 1, D[i][j - 1] + 1);
  const touched = new Set<string>();
  let inserts = false;
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && D[i][j] === D[i - 1][j - 1] + (x[i - 1].ch === y[j - 1] ? 0 : 1)) {
      if (x[--i].ch !== y[--j]) touched.add(a[x[i].word]);
    } else if (i > 0 && D[i][j] === D[i - 1][j] + 1) touched.add(a[x[--i].word]);
    else {
      j--;
      inserts = true;
      // A letter only b has: blame the words on either side of it.
      for (const at of [i - 1, i]) if (x[at]) touched.add(a[x[at].word]);
    }
  }
  return { touched, inserts };
}

/** OCR writes the subscript ra of ਪ੍ਰਭ as ਪਰ੍ਭ. */
const fixRa = (word: string) => word.replace(/ਰ੍/g, "੍ਰ");

/**
 * Both scans were read by the same OCR engine, so they share its errors: dropped nasals, adhak,
 * nukta and subscripts. A difference those losses explain is a slip only if the print shows more
 * than the typed text, never less.
 */
function ocrLoss(typed: string, print: string): boolean {
  const strip = (x: string) => fixRa(x).normalize("NFD").replace(/੍[ਰਵਯਹ]?/g, "").replace(/[ੰਂੱ਼]/g, "");
  const len = (x: string) => [...fixRa(x).normalize("NFD")].length;
  return strip(typed) === strip(print) && len(print) < len(typed);
}

/** A scan's word as it goes into the text: subscript ra fixed, OCR punctuation dropped. */
const clean = (word: string) => fixRa(word).replace(/[^\u0A00-\u0A7F]/gu, "");

/** OCR sometimes yields impossible spellings (a vowel sign before a subscript: ਦਿ੍ਗਨ for ਦ੍ਰਿਗਨ). */
const wellFormed = (word: string) => {
  const w = clean(word);
  return w !== "" && !/[ਾਿੀੁੂੇੈੋੌ]੍|੍[ਾਿੀੁੂੇੈੋੌੰਂੱ]|੍$|^[ਾਿੀੁੂੇੈੋੌੰਂੱ੍]/.test(w);
};
const isSlip = (k: WordKind) => k === "typing-slip" || k === "probable-slip";

const same = (x: string | null, y: string | null) => x !== null && y !== null && editionFold(fixRa(x)) === editionFold(fixRa(y));
const sameSkel = (x: string | null, y: string | null) => x !== null && y !== null && loose(x) === loose(y);

export function triangulate(typed: string, print: string | null, ce: string | null): Triangulation {
  if (isHeading(typed)) return { verdict: "heading", text: typed, words: [] };
  if (print === null || ce === null) return { verdict: "manuscript", text: typed, words: [] };
  const t = split(typed);
  const p = alignWords(t, split(print));
  const printDiff = letterDiff(t, split(print), (w) => editionFold(fixRa(w)));
  const c = alignWords(t, split(ce));
  const words: WordDiff[] = [];
  const out: string[] = [];

  const insertions = (slot: number) => {
    // A word the typed text lacks counts only if print and CE both have it at the same place.
    for (const w of p.inserted[slot]) {
      if (!skeleton(w)) continue;
      const k = c.inserted[slot].findIndex((x) => sameSkel(x, w));
      if (k < 0) continue;
      const sure = same(w, c.inserted[slot][k]) && wellFormed(w);
      words.push({ typed: "", print: clean(w), ce: c.inserted[slot][k], kind: sure ? "typing-slip" : "probable-slip" });
      if (sure) out.push(clean(w));
    }
    for (const w of c.inserted[slot]) {
      if (skeleton(w) && !p.inserted[slot].some((x) => sameSkel(x, w))) words.push({ typed: "", print: "", ce: w, kind: "recension" });
    }
  };

  t.forEach((w, i) => {
    insertions(i);
    const pw = p.at[i];
    const cw = c.at[i];
    if (!skeleton(w)) return void out.push(w); // numbers, stray symbols
    const slip = (exact: boolean) => {
      // Not a slip if the scans only lost what OCR loses, or only divide the words differently.
      if (ocrLoss(w, pw!) || !printDiff.touched.has(w)) return void out.push(w);
      const sure = exact && wellFormed(pw!);
      words.push({ typed: w, print: clean(pw!), ce: cw ?? "", kind: sure ? "typing-slip" : "probable-slip" });
      out.push(sure ? clean(pw!) : w);
    };
    if (same(w, cw)) return void out.push(w); // agreed, or print OCR noise
    if (same(pw, cw)) return slip(true);
    const [tp, tc, pc] = [sameSkel(w, pw), sameSkel(w, cw), sameSkel(pw, cw)];
    if (tc) return void out.push(w); // spelling only, or print OCR noise
    if (pc) return slip(false);
    words.push({ typed: w, print: pw ?? "", ce: cw ?? "", kind: tp ? "recension" : "three-way" });
    out.push(w);
  });
  insertions(t.length);

  // Word division differs between editions (CE joins compounds, splits others), so a word
  // only counts as a reading if its letters differ when the two half-lines are compared whole.
  const { touched, inserts } = letterDiff(t, split(ce));
  const real = words.filter((d) => {
    if (isSlip(d.kind)) return true;
    if (d.typed === "") return inserts;
    return touched.has(d.typed);
  });
  words.splice(0, words.length, ...real);
  const needsMs = words.some((d) => !isSlip(d.kind));
  return {
    verdict: needsMs ? "manuscript" : words.length ? "typing-slip" : "agreed",
    text: words.some((d) => d.kind === "typing-slip") ? out.join(" ") : typed,
    words,
  };
}
