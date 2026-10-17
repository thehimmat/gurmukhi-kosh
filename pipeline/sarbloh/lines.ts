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
  /** SARBLOH_SHABAD_BASE + the line's section number (sectionIndexes), counting from 1. */
  shabad_id: number;
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
  const lines = items.map((it) => ({
    gurmukhi: `${it.words.join(" ")} ${it.refs.length ? refDigits(it.refs.join(".")) : "॥"}`,
    ang: it.ang,
    ...(it.dropped.length ? { dropped: it.dropped } : {}),
  }));
  const sections = sectionIndexes(lines);
  return lines.map((l, k) => ({ ...l, shabad_id: SARBLOH_SHABAD_BASE + 1 + sections[k] }));
}

const toAsciiNumber = (g: string) => String(toInt(g));

// ---------------------------------------------------------------------------------------------
// Sections (shabad_id): one per run of one chhand, or per titled section, as Dasam Bani has them
// from BaniDB. Migration 060 applies the same rules in SQL to the rows already loaded; keep the
// word lists below and its arrays the same (tests/sarbloh-sections.test.ts checks).

/**
 * Sarbloh shabad ids are SARBLOH_SHABAD_BASE + 1, + 2, ... in reading order. The shared shabads table
 * holds SGGS (1-5540), Dasam Bani (7402+), Bhai Gurdas (40001+) and a few BaniDB ids up to 555569.
 * These ids are ours, assigned internally (no source publishes Sarbloh shabad ids), and nothing
 * reserves the range: a source loaded later could use ids here and clash (see migration 061).
 */
export const SARBLOH_SHABAD_BASE = 900000;

/** Chhand names (as typed, with variants) → the chhand they name, so a run survives spelling changes. */
export const CHHANDS: Record<string, string> = {
  ਚੌਪਈ: "ਚੌਪਈ", ਚੁਪਈ: "ਚੌਪਈ", ਚਉਪਈ: "ਚੌਪਈ", ਚਰਪਈ: "ਚੌਪਈ", ਚੌਪਾਈ: "ਚੌਪਈ",
  ਦੋਹਰਾ: "ਦੋਹਰਾ", ਦੋਹਿਰਾ: "ਦੋਹਰਾ", ਦੋਹਾ: "ਦੋਹਰਾ",
  ਸੋਰਠਾ: "ਸੋਰਠਾ",
  ਛਪਯ: "ਛਪਯ", ਛਪੈ: "ਛਪਯ",
  ਕਬਿੱਤ: "ਕਬਿੱਤ", ਕਬਿਤ: "ਕਬਿੱਤ", ਕਵਿਤ: "ਕਬਿੱਤ", ਕਬਿਤੁ: "ਕਬਿੱਤ",
  ਸ੍ਵੈਯਾ: "ਸ੍ਵੈਯਾ", ਸਵੈਯਾ: "ਸ੍ਵੈਯਾ", ਸਵੱਯਾ: "ਸ੍ਵੈਯਾ",
  ਨਰਾਜ: "ਨਰਾਜ", ਨਰਾਚ: "ਨਰਾਜ",
  ਭੁਜੰਗ: "ਭੁਜੰਗ",
  ਅੜਿਲ: "ਅੜਿਲ", ਅੜਿੱਲ: "ਅੜਿਲ",
  ਤ੍ਰਿਭੰਗੀ: "ਤ੍ਰਿਭੰਗੀ", ਤਿਭੰਗੀ: "ਤ੍ਰਿਭੰਗੀ",
  ਰਸਾਵਲ: "ਰਸਾਵਲ", ਤੋਮਰ: "ਤੋਮਰ", ਪਾਧੜੀ: "ਪਾਧੜੀ", ਝੂਲਨਾ: "ਝੂਲਨਾ", ਰੇਖਤਾ: "ਰੇਖਤਾ",
  ਸਲੋਕ: "ਸਲੋਕ", ਪਉੜੀ: "ਪਉੜੀ", ਕਲਸ: "ਕਲਸ",
  ਚਰਪਦ: "ਚਰਪਦ", ਚਰਪਦਾ: "ਚਰਪਦ", ਚਤੁਰਪਦ: "ਚਰਪਦ", ਚਉਪਦਾ: "ਚਰਪਦ",
  // A chhand the header names after these; the whole header stands for it.
  ਛੰਦ: "", ਛੰਤ: "",
};
/** Chhand names the typist sometimes cut short; a header only when they are the whole line. */
export const CHHAND_LINES: Record<string, string> = { ਪਈ: "ਚੌਪਈ" };
/** Lines that open or label a stretch without naming a chhand: never a split, never the end of one. */
export const LABEL_LINES = ["ਸਾਨੀ", "ਮਲਾਰ", "ਮਲ੍ਹਾਰ", "ਸਮ"];
/** Lines that finish the verse before them (॥੧॥ ਰਹਾਉ ॥), so stay in its section. */
export const TRAILER_LINES = ["ਰਹਾਉ"];
/** Words that mark a speaker (… ਬਾਚ) or an invocation (… ਜੀ ਸਹਾਇ, … ਕੀ ਫਤਿਹ). */
export const LABEL_ENDINGS = ["ਬਾਚ", "ਵਾਚ", "ਸਹਾਇ", "ਫਤਿਹ", "ਫ਼ਤਿਹ"];
/** First words of a colophon (ਇਤਿ ਸ੍ਰੀ … ਸਮਾਪਤਿ), which closes the section it ends. */
export const COLOPHON_WORDS = ["ਇਤਿ", "ਇਤੀ", "ਇਤ"];

/** Most words a chhand header or a label carries ("ਦੋਹਾ ਪਰਸ ਰਾਮ ਬਾਚ"); verse half-lines run longer. */
const HEADER_WORDS = 6;
/** Most words of a numbered label closing a piece (ਦਸਕ ॥੧॥, ਰਹਾਉ ਦੂਜਾ ॥੮॥); a verse's last half-line runs longer. */
const LABEL_NUMBERED_WORDS = 2;
const VERSE_NUMBER = /॥([੦-੯]+)(?:॥[੦-੯]+)*॥$/;

type Kind = { kind: "verse" } | { kind: "numbered"; count: number; short: boolean } | { kind: "colophon" } | { kind: "title"; chhand: string }
  | { kind: "header"; chhand: string } | { kind: "label" } | { kind: "trailer" };

/** The chhand a header names: its first chhand word, or for "ਛੰਦ X" / "X ਛੰਦ", the whole header. */
function chhandOf(words: string[], text: string): string | null {
  const known = words.find((w) => CHHANDS[w]);
  if (known) return CHHANDS[known];
  return words.some((w) => w in CHHANDS) ? text : null;
}

function classify(gurmukhi: string): Kind {
  const words = gurmukhi.replace(/[।॥੦-੯]+/g, " ").trim().split(/\s+/).filter(Boolean);
  const text = words.join(" ");
  if (COLOPHON_WORDS.includes(words[0])) return { kind: "colophon" };
  const n = VERSE_NUMBER.exec(gurmukhi);
  if (n) return { kind: "numbered", count: toInt(n[1]), short: words.length <= LABEL_NUMBERED_WORDS };
  if (words.includes("ਅਥ") || words[0]?.startsWith("ਬਿਸਨ")) return { kind: "title", chhand: chhandOf(words, text) ?? text };
  if (TRAILER_LINES.includes(text)) return { kind: "trailer" };
  if (CHHAND_LINES[text]) return { kind: "header", chhand: CHHAND_LINES[text] };
  if (words.length <= HEADER_WORDS) {
    const chhand = chhandOf(words, text);
    if (chhand) return { kind: "header", chhand };
  }
  if (LABEL_LINES.includes(text) || words.includes("ੴ") || (words.length <= HEADER_WORDS && LABEL_ENDINGS.some((e) => words.some((w) => w.endsWith(e))))) {
    return { kind: "label" };
  }
  return { kind: "verse" };
}

/**
 * The section (0, 1, 2, ...) each line belongs to. Headers count only between verses (after a
 * numbered line, a colophon, or another header or label), and a section starts at the first of the
 * header and label lines before its first verse:
 *   - a title (ਅਥ …, ਬਿਸਨੁਪਦ …) always starts one;
 *   - a chhand header starts one when it names another chhand than the run it follows, so the
 *     "ਦੋਹਾ ॥" repeated before each couplet of a run stays in it;
 *   - a colophon ends one, so whatever header follows starts the next;
 *   - with no header, a verse count back at ੧ starts one at that verse;
 *   - ਰਹਾਉ, or a short numbered label (ਦਸਕ ॥੧॥) right after a verse, stays with that verse.
 * A section takes no split before its first verse, so a title block (ੴ …, ਅਥ …, ਦੋਹਰਾ) is one start.
 */
export function sectionIndexes(lines: Array<{ gurmukhi: string }>): number[] {
  const starts = new Set<number>([0]);
  let run: string | null = null; // chhand of the current run
  let versed = false; // the current section has a numbered line
  let between = true; // the line before ended a verse, or was a header, label or colophon
  let blockStart = 0; // first line after the last verse: where a split here would start
  let blockSplit = false; // a section already starts at blockStart
  const split = () => {
    starts.add(blockStart);
    versed = false;
    blockSplit = true;
  };
  lines.forEach(({ gurmukhi }, i) => {
    const k = classify(gurmukhi);
    // A short numbered line right after a verse labels the piece it closes, like ਰਹਾਉ.
    if (k.kind === "numbered" && k.short && between) {
      if (!blockSplit) blockStart = i + 1;
      return;
    }
    if (k.kind === "colophon" || k.kind === "numbered") {
      if (k.kind === "numbered" && k.count === 1 && versed && !blockSplit) split();
      if (k.kind === "numbered") versed = true;
      else run = null;
      between = true;
      blockStart = i + 1;
      blockSplit = false;
      return;
    }
    if (!between || k.kind === "verse") {
      between = false;
      return;
    }
    if (k.kind === "trailer") {
      if (!blockSplit) blockStart = i + 1;
      return;
    }
    if (k.kind === "title" || k.kind === "header") {
      if (versed && !blockSplit && (k.kind === "title" || k.chhand !== run)) split();
      if (!versed) run = k.chhand;
    }
  });
  let section = -1;
  return lines.map((_, i) => (starts.has(i) ? ++section : section));
}
