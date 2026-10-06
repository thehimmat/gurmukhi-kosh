// Collate editions of a text half-line by half-line (scan triage → canonical text).
//
// Two editions of the same granth rarely agree on spelling, word division or
// verse numbering, so lines are compared after an *edition fold* that erases
// those conventions (ਮਾਯਾ/ਮਾਇਆ, ਕਰਿ/ਕਰ, ਸੁਖ ਸਾਗਰ/ਸੁਖਸਾਗਰ) and the commonest OCR
// confusion (subscript ਰ read as aunkar). What survives the fold is a reading
// difference worth a human (or manuscript) look.
//
// Alignment is by text, never by verse number: editions number differently.

const NUKTA = "਼";
const GURMUKHI_SIGNS = /[ਁ-੥ੰ-ੵ]/g; // letters + vowel signs; excludes digits
const GURMUKHI_DIGITS = "੦੧੨੩੪੫੬੭੮੯";

export interface Pada {
  text: string;
  /** Verse numbers closing this half-line, ASCII and dot-joined ("5.337"); null mid-verse. */
  ref: string | null;
}

const toAscii = (s: string) => s.replace(/[੦-੯]/g, (d) => String(GURMUKHI_DIGITS.indexOf(d)));

/** Split a text into half-lines at dandas, attaching the verse numbers that close each one. */
export function splitPadas(text: string): Pada[] {
  const cleaned = text.replace(/\[\[[^\]]*\]\]/g, " ").replace(/[0-9]/g, " ");
  const out: Pada[] = [];
  for (const seg of cleaned.split(/[।॥]+/)) {
    const t = seg.replace(/\s+/g, " ").trim();
    if (!t) continue;
    if (/^[੦-੯\s.]+$/.test(t)) {
      const num = toAscii(t.replace(/\s+/g, ""));
      const last = out[out.length - 1];
      if (last) last.ref = last.ref ? `${last.ref}.${num}` : num;
      continue;
    }
    if (!t.match(GURMUKHI_SIGNS)) continue;
    out.push({ text: t, ref: null });
  }
  return out;
}

// Order matters: conjunct forms before their parts.
const FOLDS: Array<[string, string]> = [
  [NUKTA, ""],
  ["ੱ", ""],
  ["ਂ", "ੰ"],
  ["ੀ", "ਿ"],
  ["ੂ", "ੁ"],
  ["ੈ", "ੇ"],
  ["ੌ", "ਉ"],
  ["੍ਯਾ", "ਿਆ"],
  ["੍ਯ", "ਿਅ"],
  ["ਯਾ", "ਇਆ"],
  ["ਯ", "ਇ"],
  ["੍ਰ", "ੁ"], // OCR reads subscript ra as aunkar; fold both to one
  ["੍ਵ", "ਵ"],
  ["੍", ""],
  ["ਣ", "ਨ"],
];

/** Fold one word so that edition spelling conventions and common OCR slips compare equal. */
export function editionFold(word: string): string {
  let w = (word.normalize("NFD").match(GURMUKHI_SIGNS) ?? []).join("");
  for (const [a, b] of FOLDS) w = w.split(a).join(b);
  w = w.replace(/ੁ+/g, "ੁ");
  while (w.endsWith("ਿ") || w.endsWith("ੁ")) w = w.slice(0, -1); // word-final short vowels vary freely
  return w;
}

/** Edition-folded letters of a whole half-line, word division ignored. */
export function foldLetters(text: string): string {
  return text.split(/\s+/).map(editionFold).join("");
}

function lcs(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  let prev = new Uint16Array(b.length + 1);
  let cur = new Uint16Array(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[b.length];
}

/** 0–100 similarity of two half-lines after the edition fold (indel ratio). */
export function similarity(a: string, b: string): number {
  const x = [...foldLetters(a)];
  const y = [...foldLetters(b)];
  if (!x.length || !y.length) return 0;
  return (200 * lcs(x, y)) / (x.length + y.length);
}

const HEADING_WORDS = new Set(
  "ਦੋਹਰਾ ਦੋਹਿਰਾ ਦੋਹਾ ਸੋਰਠਾ ਚੌਪਈ ਚਉਪਈ ਛਪਯ ਛਪੈ ਛੰਦ ਸਵਯਾ ਸਵੈਯਾ ਸ੍ਵੈਯਾ ਬਿਸਨਪਦ ਬਿਸਨੁਪਦ ਬਿਸ੍ਨਪਦ ਰਾਗ ਰਾਗੁ ਤਰਹ ਅੜਿਲ ਭੁਜੰਗ ਪ੍ਰਯਾਤ ਨਰਾਜ ਕਬਿਤ ਤੋਮਰ ਪਾਧੜੀ ਰਹਾਉ ਅਸਟਪਦੀ ਤਿਪਦਾ ਪੜਤਾਲ"
    .split(" ")
    .map(editionFold),
);

/** A metre or raag label (ਪੰਚਾਲ ਦੋਹਰਾ, ਬਿਸਨੁਪਦ ਰਾਗੁ ਭੈਰਉ ਦੂਜੀ ਤਰਹ) rather than verse text. */
export function isHeading(text: string): boolean {
  const words = text.split(/\s+/).map(editionFold).filter(Boolean);
  return words.length > 0 && words.length <= 7 && words.some((w) => HEADING_WORDS.has(w));
}

export type Band = "same" | "probable" | "definite" | "heading" | "missing";

/** Band a pair of half-lines: same (spelling only), probable or definite variant, heading, missing. */
export function classify(base: string, other: string | null): Band {
  if (other === null) return "missing";
  const s = similarity(base, other);
  if (s >= 90) return "same";
  if (isHeading(base) || isHeading(other)) return "heading";
  return s >= 75 ? "probable" : "definite";
}

export type Pair = [number | null, number | null];

// Needleman–Wunsch over half-lines: reward similar pairs, punish dissimilar ones.
function alignGap(a: string[], b: string[], ia: number, ib: number): Pair[] {
  const n = a.length;
  const m = b.length;
  if (!n) return b.map((_, j) => [null, ib + j]);
  if (!m) return a.map((_, i) => [ia + i, null]);
  const GAP = -20;
  const score = new Float64Array((n + 1) * (m + 1));
  const back = new Uint8Array((n + 1) * (m + 1));
  const at = (i: number, j: number) => i * (m + 1) + j;
  for (let i = 1; i <= n; i++) [score[at(i, 0)], back[at(i, 0)]] = [i * GAP, 1];
  for (let j = 1; j <= m; j++) [score[at(0, j)], back[at(0, j)]] = [j * GAP, 2];
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const d = score[at(i - 1, j - 1)] + similarity(a[i - 1], b[j - 1]) - 50;
      const u = score[at(i - 1, j)] + GAP;
      const l = score[at(i, j - 1)] + GAP;
      const best = Math.max(d, u, l);
      score[at(i, j)] = best;
      back[at(i, j)] = best === d ? 0 : best === u ? 1 : 2;
    }
  }
  const pairs: Pair[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    const k = back[at(i, j)];
    if (i > 0 && j > 0 && k === 0) pairs.push([ia + --i, ib + --j]);
    else if (i > 0 && (j === 0 || k === 1)) pairs.push([ia + --i, null]);
    else pairs.push([null, ib + --j]);
  }
  return pairs.reverse();
}

// Longest increasing subsequence of anchor pairs by their b index.
function lis(pairs: Array<[number, number]>): Array<[number, number]> {
  const tails: number[] = [];
  const prev = new Array<number>(pairs.length).fill(-1);
  for (let k = 0; k < pairs.length; k++) {
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (pairs[tails[mid]][1] < pairs[k][1]) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0) prev[k] = tails[lo - 1];
    tails[lo] = k;
  }
  const out: Array<[number, number]> = [];
  for (let k = tails.length ? tails[tails.length - 1] : -1; k >= 0; k = prev[k]) out.push(pairs[k]);
  return out.reverse();
}

const MIN_ANCHOR = 6;

/**
 * Align two editions' half-lines. Lines identical after the fold and unique on
 * both sides anchor the alignment; the stretches between anchors are aligned
 * by similarity. Returns [baseIndex, otherIndex] pairs in order; null marks a
 * line present on one side only.
 */
export function align(base: string[], other: string[]): Pair[] {
  const keyA = base.map(foldLetters);
  const keyB = other.map(foldLetters);
  const count = (keys: string[]) => {
    const m = new Map<string, number>();
    for (const k of keys) m.set(k, (m.get(k) ?? 0) + 1);
    return m;
  };
  const ca = count(keyA);
  const cb = count(keyB);
  const posB = new Map<string, number>();
  keyB.forEach((k, j) => posB.set(k, j));
  const candidates: Array<[number, number]> = [];
  keyA.forEach((k, i) => {
    if (k.length >= MIN_ANCHOR && ca.get(k) === 1 && cb.get(k) === 1) candidates.push([i, posB.get(k)!]);
  });
  const anchors = lis(candidates);

  const pairs: Pair[] = [];
  let ia = 0;
  let ib = 0;
  for (const [i, j] of [...anchors, [base.length, other.length] as [number, number]]) {
    pairs.push(...alignGap(base.slice(ia, i), other.slice(ib, j), ia, ib));
    if (i < base.length) pairs.push([i, j]);
    ia = i + 1;
    ib = j + 1;
  }
  return pairs;
}

// Vowel-light skeleton for matching handwriting: short vowels and nasal signs dropped.
function skeleton(text: string): string {
  return foldLetters(text).replace(/[ਿੁੰ]/g, "");
}

/**
 * Find where a snippet (e.g. the opening of a manuscript page, written larivaar)
 * starts among an edition's half-lines. Returns the half-line index and a 0–100 score.
 */
export function locate(snippet: string, padas: Pada[]): { index: number; score: number } {
  const owner: number[] = [];
  let stream = "";
  padas.forEach((p, i) => {
    const s = skeleton(p.text);
    stream += s;
    for (let k = 0; k < [...s].length; k++) owner.push(i);
  });
  const S = [...stream];
  const q = [...skeleton(snippet)];
  if (!q.length || !S.length) return { index: -1, score: 0 };
  // Semi-global edit distance: the snippet must be consumed whole, the stream may start anywhere.
  let prev = new Int32Array(S.length + 1);
  let prevStart = Int32Array.from({ length: S.length + 1 }, (_, j) => j);
  for (let i = 1; i <= q.length; i++) {
    const cur = new Int32Array(S.length + 1);
    const curStart = new Int32Array(S.length + 1);
    cur[0] = i;
    curStart[0] = 0;
    for (let j = 1; j <= S.length; j++) {
      const sub = prev[j - 1] + (q[i - 1] === S[j - 1] ? 0 : 1);
      const del = prev[j] + 1;
      const ins = cur[j - 1] + 1;
      if (sub <= del && sub <= ins) [cur[j], curStart[j]] = [sub, prevStart[j - 1]];
      else if (del <= ins) [cur[j], curStart[j]] = [del, prevStart[j]];
      else [cur[j], curStart[j]] = [ins, curStart[j - 1]];
    }
    prev = cur;
    prevStart = curStart;
  }
  let best = 1;
  for (let j = 2; j <= S.length; j++) if (prev[j] < prev[best]) best = j;
  const start = Math.min(prevStart[best], owner.length - 1);
  return { index: owner[start], score: Math.max(0, 100 * (1 - prev[best] / q.length)) };
}

export interface PageOpening {
  page: number;
  /** First words of the page as written (larivaar is fine). */
  opening: string;
}

export interface PageIndexEntry extends PageOpening {
  /** Index of the edition half-line where the page opens. */
  pada: number;
  score: number;
  /** Nearest verse number at or after the opening, for human cross-reference. */
  nextRef: string | null;
  flag: "low-score" | "out-of-order" | null;
}

const MIN_LOCATE_SCORE = 60;

/** Locate each manuscript page's opening in an edition, flagging doubtful readings. */
export function buildPageIndex(openings: PageOpening[], padas: Pada[]): PageIndexEntry[] {
  const out: PageIndexEntry[] = [];
  let lastGood = -1;
  for (const o of [...openings].sort((a, b) => a.page - b.page)) {
    const { index, score } = locate(o.opening, padas);
    let nextRef: string | null = null;
    for (let k = Math.max(index, 0); k < padas.length && nextRef === null; k++) nextRef = padas[k].ref;
    const flag = score < MIN_LOCATE_SCORE ? "low-score" : index < lastGood ? "out-of-order" : null;
    if (!flag) lastGood = index;
    out.push({ ...o, pada: index, score: Math.round(score), nextRef, flag });
  }
  return out;
}

/** Manuscript pages to look at for an edition half-line, interpolated between index points. */
export function pagesFor(pada: number, index: PageIndexEntry[]): number[] {
  const good = index.filter((e) => e.flag === null).sort((a, b) => a.page - b.page);
  if (!good.length) return [];
  let k = good.findIndex((e) => e.pada > pada) - 1;
  if (k === -2) k = good.length - 1; // past the last point
  if (k < 0) return [good[0].page - 1, good[0].page];
  const A = good[k];
  if (pada === A.pada) return [A.page - 1, A.page]; // openings often fall mid-line
  const B = good[k + 1] ?? null;
  const span = B ? B.page - A.page : 0;
  const perPage = B ? (B.pada - A.pada) / span : k > 0 ? (A.pada - good[k - 1].pada) / (A.page - good[k - 1].page) : 1;
  const est = Math.round(A.page + (pada - A.pada) / perPage);
  const w = span > 5 ? Math.ceil(span / 4) : 1;
  const lo = Math.max(A.page, est - w);
  const hi = B ? Math.min(B.page, est + w) : est + w;
  return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
}
