// Split Sahib Singh's Darpan pad-arth for one line into its glossed terms.
//
// A pad-arth body (line_translations, source_code='ss_padarth') is a run of
// sentences, most of them `term = gloss`, separated by dandas:
//   ਸੋਚੈ = ਸੁਚਿ ਰੱਖਣ ਨਾਲ। ਸੋਚਿ = ਸੁਚਿ, ਪਵਿੱਤਰਤਾ। ਨ ਹੋਵਈ = ਨਹੀਂ ਹੋ ਸਕਦੀ।
// A term may be a phrase (ਨ ਹੋਵਈ). Some rows use a dash instead of = (ਸੂਰ-ਸੂਰਮੇ,
// ਹੈ– ਭਾਵ). Between entries sit notes, quotations and numbered asides — those
// are kept as notes on the entry they follow, so nothing in the source is lost.
//
// This module is pure (text → entries); matching terms to words of the line is
// lib/padarth/align.ts.

export type PadarthEntry = {
  /** The glossed Gurmukhi word or phrase, whitespace-normalised. */
  term: string;
  gloss: string;
  /** Sentences after this entry that are not entries themselves. */
  notes: string[];
};

export type ParsedPadarth = {
  entries: PadarthEntry[];
  /** Sentences before the first entry. */
  leading: string[];
};

// A term is one to six Gurmukhi words and nothing else: a sentence whose text
// before the separator has quotes, digits or Latin is prose, not an entry.
const TERM = /^[਀-੣ੰ-੿]+(?: [਀-੣ੰ-੿]+){0,5}$/;

// (1), (2)… open a numbered aside; they always start a new sentence.
const ASIDE_MARKER = /\(\s*[0-9੦-੯]+\s*\)/g;
const BOUNDARY = "\u0000";

// Bare verse numbers (1।, 3। 12।) and stray punctuation are not notes.
const NOISE = /^[\s0-9੦-੯.,;:(){}\-–—]*$/;

/** Indices of parentheses that have a partner; unclosed ones are ignored. */
function matchedParens(text: string): Set<number> {
  const matched = new Set<number>();
  const open: number[] = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "(") open.push(i);
    else if (text[i] === ")" && open.length > 0) {
      matched.add(open.pop()!);
      matched.add(i);
    }
  }
  return matched;
}

/** Split at dandas outside (matched) parentheses and at aside markers. */
function sentences(body: string): string[] {
  const text = body.replace(ASIDE_MARKER, BOUNDARY);
  const matched = matchedParens(text);
  const out: string[] = [];
  let depth = 0;
  let current = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "(" && matched.has(i)) depth++;
    else if (ch === ")" && matched.has(i)) depth--;
    if (ch === BOUNDARY || ((ch === "।" || ch === "॥") && depth === 0)) {
      out.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  out.push(current);
  return out
    .flatMap(splitAfterExclamation)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => !NOISE.test(s));
}

// A vocative gloss ends in ! with no danda before the next entry:
// "ਨਾਨਕ = ਹੇ ਨਾਨਕ! ਹੋਸੀ = ਹੋਵੇਗਾ". Split there only when an entry follows.
const ENTRY_AFTER_MARK = /[!?]\s+(?=[਀-੣ੰ-੿]+(?: [਀-੣ੰ-੿]+){0,5}\s*=)/g;

function splitAfterExclamation(sentence: string): string[] {
  return sentence.replace(ENTRY_AFTER_MARK, (m) => m[0] + BOUNDARY).split(BOUNDARY);
}

/**
 * Where a sentence's term would end: the first =, else the first dash. A plain
 * hyphen counts only when it is attached to the word before it (ਸੂਰ-ਸੂਰਮੇ), the
 * way the dash-style rows write it. Whether the text before it really is a
 * term is checked by the caller, which is what keeps compounds in prose
 * (ਰੱਖਣ-ਯੋਗ, ਇਕ-ਵਚਨ) from being read as entries.
 */
function separatorIndex(sentence: string): number {
  const eq = sentence.indexOf("=");
  if (eq >= 0) return eq;
  return sentence.search(/[–—]|(?<=[\u0A00-\u0A7F])-/);
}

function cleanGloss(gloss: string): string {
  // A note's closing brace can trail the last gloss inside it: "… (ਨਾਂਵ) }".
  return gloss.replace(/\s*\}\s*$/, "").trim();
}

export function parsePadarth(body: string): ParsedPadarth {
  const entries: PadarthEntry[] = [];
  const leading: string[] = [];
  for (const sentence of sentences(body)) {
    const sep = separatorIndex(sentence);
    const term = sep >= 0 ? sentence.slice(0, sep).trim() : "";
    if (sep >= 0 && TERM.test(term)) {
      entries.push({ term, gloss: cleanGloss(sentence.slice(sep + 1)), notes: [] });
    } else if (entries.length > 0) {
      entries[entries.length - 1].notes.push(sentence);
    } else {
      leading.push(sentence);
    }
  }
  return { entries, leading };
}
