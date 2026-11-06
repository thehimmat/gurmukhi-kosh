// Mahan Kosh "ਦੇਖੋ, …" pointer rows (#23). Mahan Kosh often gives a form no gloss of its own and
// sends the reader to another entry: "ਦੇਖੋ, ਮੰਞ.", "ਦੇਖੋ, ਕਰਣ ੧੧.", sometimes followed by quoted
// citations. Unlike Shackle (cross-reference-only, pipeline/shackle/ingest.ts) the ingest doesn't
// mark these, so they read as glosses. This recognises a row that is *only* a pointer, so the
// draft can follow it to the target's own senses instead of offering "ਦੇਖੋ, ਮੰਞ" as a meaning.
//
// Deliberately strict: a row with any words of Mahan Kosh's own besides the pointer and its
// citations is a gloss, not a pointer, and is left alone.

export type MkPointer = {
  /** The headword pointed at, as Mahan Kosh spells it. */
  target: string;
  /** "ਕਰਣ ੧੧": sense 11 of ਕਰਣ (Mahan Kosh's numbering, which definitions.sense_number keeps). */
  sense: number | null;
};

const GURMUKHI_DIGITS = "੦੧੨੩੪੫੬੭੮੯";
const toNumber = (s: string) => Number([...s].map((c) => (GURMUKHI_DIGITS.includes(c) ? GURMUKHI_DIGITS.indexOf(c) : c)).join(""));

const HEAD = /^ਦੇਖੋ[,.]?\s+([^".।]+)[.।]?(?:\s+([\s\S]*))?$/;
// A quoted citation and its optional "(ਰਾਗ ਮਃ ੫)" reference.
const CITATION = /^"[^"]*"\s*(?:\([^)]*\))?\s*[.।]?\s*/;
const TARGET = /^([\u0A00-\u0A7F\u200C\u200D]+(?: [\u0A00-\u0A7F\u200C\u200D]+)*?)(?: ([੦-੯0-9]+))?$/;

/** The pointer(s) a Mahan Kosh row consists of, or null if the row says anything else. */
export function parseMkPointer(text: string): MkPointer[] | null {
  const m = HEAD.exec(text.trim());
  if (!m) return null;
  let rest = (m[2] ?? "").trim();
  while (rest) {
    const c = CITATION.exec(rest);
    if (!c || c[0].length === 0) return null;
    rest = rest.slice(c[0].length).trim();
  }
  const out: MkPointer[] = [];
  for (const part of m[1].trim().split(/\s*,\s*|\s+ਅਤੇ\s+/)) {
    const t = TARGET.exec(part.trim());
    if (!t || /^[੦-੯]+$/.test(t[1])) return null;
    out.push({ target: t[1], sense: t[2] ? toNumber(t[2]) : null });
  }
  return out.length ? out : null;
}
