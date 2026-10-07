// Sri Sarbloh Granth → corpus lines.
//
// Source: the typed Budha Dal text (a page-for-page retyping of the Budha Dal print, converted
// from GurbaniAkhar; see pipeline/scans/sarbloh/README.md), one PDF page per form feed. Each page
// starts with its printed page number, which is the line's `ang`. The canonical half-lines
// (canon-bd.json, typing slips corrected) are split the same way, so they pair up by index.
//
// Lines follow the Dasam Bani convention in the database: one half-line per row, ending in " ॥"
// or in its verse number(s) in Gurmukhi digits, e.g. "… ॥੧੦੫॥" or "… ॥੩੬੬॥੧੧੨੦॥".

import { splitPadas } from "../scans/collate";

const DIGITS = "੦੧੨੩੪੫੬੭੮੯";
const SIGN = /[ਁ-੥ੰ-ੵ]/; // letters and vowel signs, not digits
const PAGE = ""; // page-break marker (private use)

const toInt = (g: string) => Number([...g].map((d) => DIGITS.indexOf(d)).join(""));
const toGurmukhi = (n: string) => n.replace(/[0-9]/g, (d) => DIGITS[+d]);

export interface PagedPada {
  text: string;
  ref: string | null;
  /** Printed page the half-line starts on. */
  page: number;
  /** Printed page numbers of the pages it runs onto. */
  breaks: number[];
}

/**
 * Split pages into half-lines exactly as splitPadas splits the whole text, minus the printed
 * page numbers, noting the page each half-line starts on.
 */
export function splitPagedPadas(pages: string[]): PagedPada[] {
  const numbers: number[] = [];
  const bodies = pages.map((p, k) => {
    const m = /^\s*([੦-੯]+)\s*\n/.exec(p);
    numbers.push(m ? toInt(m[1]) : k + 1);
    return m ? p.slice(m[0].length) : p;
  });
  const text = bodies.join(PAGE).replace(/[0-9]/g, " ");
  const out: PagedPada[] = [];
  let at = 0; // index into numbers
  for (const seg of text.split(/[।॥]+/)) {
    const first = seg.search(SIGN);
    let page = at;
    const breaks: number[] = [];
    for (let k = 0; k < seg.length; k++) {
      if (seg[k] !== PAGE) continue;
      at++;
      if (first < 0 || k < first) page = at;
      else breaks.push(numbers[at]);
    }
    const t = seg.split(PAGE).join(" ").replace(/\s+/g, " ").trim();
    if (!t) continue;
    if (/^[੦-੯\s.]+$/.test(t)) {
      const num = [...t.replace(/\s+/g, "")].map((d) => (DIGITS.includes(d) ? DIGITS.indexOf(d) : d)).join("");
      const last = out[out.length - 1];
      if (last) last.ref = last.ref ? `${last.ref}.${num}` : num;
      continue;
    }
    if (first < 0) continue;
    out.push({ text: t, ref: null, page: numbers[page], breaks });
  }
  return out;
}

const DANDA_LIKE = /[ñ!{}#·_→]+/g;

/** Repair legacy-font leftovers: ੴ, symbols standing for dandas, visarga; drop other stray characters. */
export function cleanText(text: string): { text: string; dropped: string[] } {
  let t = text
    .replace(/</g, "ੴ")
    .replace(DANDA_LIKE, "॥")
    .replace(/([ਁ-੥ੰ-ੵ]):(?=\s|$)/g, "$1ਃ")
    .replace(/:/g, "॥");
  // The typist sometimes entered ॥ as "ll", which the converter read as ਲਲ / ਿਲ: next to a number,
  // those tokens are dandas.
  const words = t.split(/\s+/);
  t = words
    .map((w, k) => ((w === "ਲਲ" || w === "ਿਲ") && (/^[੦-੯]+$/.test(words[k - 1] ?? "") || /^[੦-੯]/.test(words[k + 1] ?? "")) ? "॥" : w))
    .join(" ");
  const dropped: string[] = [];
  t = t.replace(/[^਀-੿\s।॥]/g, (c) => (dropped.push(c), ""));
  return { text: t.replace(/\s+/g, " ").trim(), dropped };
}

/** "366.1120" → "॥੩੬੬॥੧੧੨੦॥" */
export function refDigits(ref: string): string {
  return ref
    .split(".")
    .filter(Boolean)
    .map((n) => `॥${toGurmukhi(n)}`)
    .join("") + "॥";
}

export interface CorpusLine {
  gurmukhi: string;
  ang: number;
  /** Characters cleanText dropped, for the ingest report. */
  dropped?: string[];
}

const isNumber = (w: string) => /^[੦-੯]+$/.test(w);

/**
 * The canonical text was split before page numbers were removed, so some half-lines still carry a
 * page number. Drop the number tokens it has beyond those in the same half-line split cleanly.
 */
export function dropPageNumbers(canonical: string, clean: string): string {
  const keep = new Map<string, number>();
  for (const w of clean.split(" ").filter(isNumber)) keep.set(w, (keep.get(w) ?? 0) + 1);
  const extra = new Map<string, number>();
  for (const w of canonical.split(" ").filter(isNumber)) extra.set(w, (extra.get(w) ?? 0) + 1);
  for (const [w, n] of keep) extra.set(w, (extra.get(w) ?? 0) - n);
  return canonical
    .split(" ")
    .filter((w) => {
      if (!isNumber(w) || (extra.get(w) ?? 0) <= 0) return true;
      extra.set(w, extra.get(w)! - 1);
      return false;
    })
    .join(" ");
}

/** Words a number legitimately follows inside a heading (ਪਾਤਿਸਾਹੀ ੧੦, ਅਸਟਪਦੀ ੧, ਛਕਾ ੧). */
const NUMBERED = new Set(["ਪਾਤਿਸਾਹੀ", "ਪਾਤਸਾਹੀ", "ਪਾਤਿਸ਼ਾਹੀ", "ਮਹਲਾ", "ਅਸਟਪਦੀ", "ਛਕਾ", "ਛਕੇ"]);

/** Half-lines (canonical text, with their pages) → database lines. */
export function toLines(padas: PagedPada[]): CorpusLine[] {
  const items: Array<{ words: string[]; refs: string[]; ang: number; dropped: string[] }> = [];
  for (const p of padas) {
    const { text, dropped } = cleanText(p.text);
    const subs = splitPadas(text);
    if (!subs.length) continue;
    subs.forEach((s, k) => {
      const words = s.text.split(" ");
      const refs = [s.ref, k === subs.length - 1 ? p.ref : null].filter((r): r is string => !!r);
      // A verse number whose danda the typist left out sits at the start (the previous verse's
      // number) or at the end (this one's) of the half-line.
      while (words.length > 1 && isNumber(words[0]) && items.length) items[items.length - 1].refs.push(toAsciiNumber(words.shift()!));
      while (words.length > 1 && isNumber(words[words.length - 1]) && !NUMBERED.has(words[words.length - 2])) refs.unshift(toAsciiNumber(words.pop()!));
      items.push({ words, refs, ang: p.page, dropped: k === 0 ? dropped : [] });
    });
  }
  return items.map((it) => ({
    gurmukhi: `${it.words.join(" ")} ${it.refs.length ? refDigits(it.refs.join(".")) : "॥"}`,
    ang: it.ang,
    ...(it.dropped.length ? { dropped: it.dropped } : {}),
  }));
}

const toAsciiNumber = (g: string) => String(toInt(g));
