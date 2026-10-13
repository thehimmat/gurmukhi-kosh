// Split Sahib Singh's Darpan pad-arth for one line into its glossed terms.
//
// A pad-arth body (line_translations, source_code='ss_padarth') is a run of
// sentences, most of them `term = gloss`, separated by dandas:
//   ਸੋਚੈ = ਸੁਚਿ ਰੱਖਣ ਨਾਲ। ਸੋਚਿ = ਸੁਚਿ, ਪਵਿੱਤਰਤਾ। ਨ ਹੋਵਈ = ਨਹੀਂ ਹੋ ਸਕਦੀ।
// A term may be a phrase (ਨ ਹੋਵਈ). Some rows use a dash instead of = (ਸੂਰ-ਸੂਰਮੇ,
// ਹੈ– ਭਾਵ). Between entries sit notes, quotations and numbered asides — those
// are kept as notes on the entry they follow, so nothing in the source is lost.
//
// The `=` is not Sahib Singh's. The typed Darpan (Dhami/Thind, the Gurbani-CD
// text) writes one hyphen for both jobs, entry separator and compound joiner:
// "ਨਦਰਿ-ਕਿਰਪਾ-ਦ੍ਰਿਸ਼ਟੀ ਵਿਚ". The BaniDB `pss` text we ingest turned many of
// those hyphens into " = ", inconsistently and in both directions: some
// compounds became `=` (ਨਦਰਿ = ਕਿਰਪਾ = ਦ੍ਰਿਸ਼ਟੀ ਵਿਚ, ਸਦਾ = ਥਿਰ beside ਸਦਾ-ਥਿਰ),
// some separators stayed `-` (ਮਨਿ-ਮਨ), and some rows were never converted
// (Japji pauris 17–19). So neither character alone says which job it is doing.
//
// This module is pure (text → entries); matching terms to words of the line is
// lib/padarth/align.ts.

import { normalise } from "./align";

export type PadarthEntry = {
  /** The glossed Gurmukhi word or phrase, whitespace-normalised. */
  term: string;
  gloss: string;
  /** Sentences after this entry that are not entries themselves. */
  notes: string[];
};

export type ParseOptions = {
  /**
   * The line's word forms. Supplying them lets a comma or a closing bracket
   * also open a new entry, but ONLY where the candidate term is a word of this
   * line. Without them the parser behaves exactly as before, so no existing
   * caller changes behaviour.
   *
   * The gate is necessary because the two cases are identical as text. The
   * `pss` digitisation turned some compound hyphens into `=` (see the header),
   * so "ਮਸ਼ੱਕਤਿ, ਮਿਹਨਤ, ਘਾਲ = ਕਮਾਈ"
   * is one gloss (ghāl-kamāī), while "ਮੈਂ ਵਰਣਨ ਕਰਾਂ, ਸਭੁ ਕੋ = ਹਰੇਕ ਜੀਵ" hides a
   * second entry. Both are `, <term> =`. What separates them is that a real
   * entry glosses a word of the line and a compound does not (#181).
   */
  lineTokens?: string[];
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
function sentences(body: string, lineTokens: Set<string>): string[] {
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
    .flatMap((s) => splitBeforeEntries(lineTokens.size > 0 ? splitAtLineTerms(s, lineTokens) : s))
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => !NOISE.test(s));
}

// Some entries are not closed by a danda: a vocative gloss ends in !
// ("ਨਾਨਕ = ਹੇ ਨਾਨਕ! ਹੋਸੀ = ਹੋਵੇਗਾ") and some rows chain entries with ;
// ("ਅੰਤਰਗਤਿ = ਅੰਦਰਲਾ; ਤੀਰਥਿ = ਤੀਰਥ ਉੱਤੇ"). Split there only when an entry
// follows, so a ; between senses ("ਮਾਨੁ = ਆਦਰ; ਵਡਿਆਈ") stays in the gloss.
const ENTRY_AFTER_MARK = /[!?;]\s+(?=[਀-੣ੰ-੿]+(?: [਀-੣ੰ-੿]+){0,5}\s*=)/g;

// A comma or closing bracket can also precede a swallowed entry, but only the
// line's own words tell us whether it does (see ParseOptions.lineTokens). Two
// guards keep the false positives out, both found in the written rows (#181):
// a term repeating the entry's own term after an etymology aside
// ("ਅਨਾਹਤਿ = (ਅਨ-ਆਹਤਿ) … ਅਨਾਹਤਿ = ਨਾਸ ਰਹਿਤ"), and metalanguage inside an
// unclosed brace ("{ਨੋਟ: ਜਿਨ, ਤਿਨ, ਇਨ, ਕਿਨ = ਇਹ ਲਫ਼ਜ਼ ਬਹੁ-ਵਚਨ ਹਨ").
const ENTRY_AFTER_BOUNDARY =
  /[,)}]\s+(?=([਀-੣ੰ-੿]+(?: [਀-੣ੰ-੿]+){0,5})\s*=)/g;

/** Is every word of the candidate term a word of this line? */
function isLineTerm(term: string, lineTokens: Set<string>): boolean {
  const words = term.split(" ").filter(Boolean);
  return words.length > 0 && words.every((w) => lineTokens.has(normalise(w)));
}

/**
 * Are we inside an unclosed brace once the boundary character is consumed?
 * The boundary itself is counted, so a `}` that closes the brace leaves depth
 * at 0 and the candidate after it is eligible.
 */
function insideBrace(sentence: string, at: number): boolean {
  let depth = 0;
  for (let i = 0; i <= at; i++) {
    if (sentence[i] === "{") depth++;
    else if (sentence[i] === "}" && depth > 0) depth--;
  }
  return depth > 0;
}

function splitAtLineTerms(sentence: string, lineTokens: Set<string>): string {
  const ownTerm = sentence.slice(0, Math.max(separatorIndex(sentence), 0)).trim();
  const ownKey = ownTerm.split(/\s+/).filter(Boolean).map(normalise).join(" ");
  return sentence.replace(ENTRY_AFTER_BOUNDARY, (m, term: string, at: number) => {
    const key = term.split(" ").filter(Boolean).map(normalise).join(" ");
    if (key === ownKey) return m;
    if (insideBrace(sentence, at)) return m;
    if (!isLineTerm(term, lineTokens)) return m;
    return m[0] === "," ? BOUNDARY : m[0] + BOUNDARY;
  });
}

function splitBeforeEntries(sentence: string): string[] {
  return sentence
    .replace(ENTRY_AFTER_MARK, (m) => (m[0] === ";" ? BOUNDARY : m[0] + BOUNDARY))
    .split(BOUNDARY);
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

export function parsePadarth(body: string, opts: ParseOptions = {}): ParsedPadarth {
  const entries: PadarthEntry[] = [];
  const leading: string[] = [];
  const lineTokens = new Set((opts.lineTokens ?? []).map(normalise));
  for (const sentence of sentences(body, lineTokens)) {
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
