// Gurmukhi numerals in the corpus: reading them, and telling apart the two
// jobs they do in a line.
//
// Most numbers in Gurbani are structural tallies closing a verse — ॥੧॥, or a
// chain like ॥੪॥੪॥੧੬॥ counting the pauri, the shabad, and the running total.
// A much smaller set are HEADING numbers that identify the composition: the
// author (ਮਹਲਾ ੫, ਮਃ ੩, ਪਾਤਿਸਾਹੀ ੧੦) and the ghar (ਘਰੁ ੨). Searching for a
// number is only useful if those two can be separated, so this module assigns
// each numeral in a line a role; the search surface filters on it and hides
// verse markers by default.
//
// The discriminator is the danda. A numeral that a ॥ (or the single । used in
// Bhai Gurdas Vaaran) runs straight into is a tally — that is what the danda
// notation means — and no heading number is ever written that way. Everything
// else is a heading number, sub-typed by the nearest preceding keyword.

export const NUMERAL_ROLES = [
  "author",
  "ghar",
  "heading_other",
  "verse_marker",
] as const;

export type NumeralRole = (typeof NUMERAL_ROLES)[number];

/**
 * Roles shown when a number search has not been filtered yet.
 *
 * Verse markers are left out: they are the large majority of numerals in the
 * text and almost never what someone searching a number is looking for, so
 * they stay an opt-in checkbox rather than burying the heading hits.
 */
export const DEFAULT_NUMERAL_ROLES = [
  "author",
  "ghar",
  "heading_other",
] as const satisfies readonly NumeralRole[];

/** Short labels for the role filter, in the order they should be offered. */
export const NUMERAL_ROLE_LABELS: Record<NumeralRole, string> = {
  author: "ਮਹਲਾ / ਪਾਤਿਸਾਹੀ",
  ghar: "ਘਰੁ",
  heading_other: "other heading",
  verse_marker: "verse marker",
};

export type NumeralOccurrence = {
  /** The numeral's integer value, so ੧੦ and a typed "10" match each other. */
  value: number;
  /** The digits exactly as they appear in the line. */
  raw: string;
  /** Character offsets of `raw` within the line, for highlighting. */
  start: number;
  end: number;
  role: NumeralRole;
  /** The heading keyword the role came from, when one did. */
  keyword: string | null;
};

// Gurmukhi digits are U+0A66–U+0A6F. ASCII digits are accepted on input only
// (a Latin keyboard typing "10" must find ੧੦); the corpus itself is Gurmukhi.
const GURMUKHI_ZERO = 0x0a66;
const DIGIT_RUN = /[੦-੯0-9]+/g;
const ALL_DIGITS = /^[੦-੯0-9]+$/;
// Non-global on purpose: DIGIT_RUN carries lastIndex state, this must not.
const DIGIT_ANYWHERE = /[੦-੯0-9]/;

// Both dandas: the double ॥ of SGGS and Dasam, and the single । that the Bhai
// Gurdas Vaaran text uses to close a line. The ASCII | is how some sources
// transliterate them (lib/tokenizer.ts strips the same set).
const DANDA = /[॥।|]/;

// Author keywords. ਮਃ is the abbreviation of ਮਹਲਾ and is written with visarga
// (U+0A03); some texts use an ASCII colon instead, so both spellings are
// listed rather than normalized away.
// The variants below are the ones actually counted in the corpus, not a
// guess: ਮਹਲਾ/ਮਹਲੇ/ਮਹਲੁ/ਮਹਲ all head a mahalla number somewhere, and
// ਪਾਤਿਸਾਹੀ appears with and without the nukta on ਸ.
const AUTHOR_KEYWORDS = new Set([
  "ਮਹਲਾ",
  "ਮਹਲੇ",
  "ਮਹਲੁ",
  "ਮਹਲ",
  "ਮਃ",
  "ਮ:",
  "ਪਾਤਿਸਾਹੀ",
  "ਪਾਤਸਾਹੀ",
  "ਪਾਤਿਸ਼ਾਹੀ",
  "ਪਾਤਸ਼ਾਹੀ",
  "ਪਾਤਿਸਾਹ",
]);

const GHAR_KEYWORDS = new Set(["ਘਰੁ", "ਘਰਿ", "ਘਰ"]);

// How many words back to look for a keyword. The order is not fixed — the
// user's case ਮਹਲਾ ਪਹਿਲਾ ੧ writes the mahalla out in words between the
// keyword and its number — so the search is a short window rather than the
// immediately preceding word, stopping at any danda.
const KEYWORD_LOOKBACK = 3;

/** Reads a pure digit run (either script) as an integer; null for anything else. */
export function parseGurmukhiNumber(s: string): number | null {
  const t = s.trim();
  if (!ALL_DIGITS.test(t)) return null;
  let n = 0;
  for (const ch of t) {
    const code = ch.codePointAt(0)!;
    const digit =
      code >= GURMUKHI_ZERO && code <= GURMUKHI_ZERO + 9
        ? code - GURMUKHI_ZERO
        : code - 0x30;
    n = n * 10 + digit;
  }
  return n;
}

/** Renders a non-negative integer in Gurmukhi digits. */
export function toGurmukhiNumber(n: number): string {
  return String(Math.trunc(Math.abs(n)))
    .split("")
    .map((d) => String.fromCodePoint(GURMUKHI_ZERO + Number(d)))
    .join("");
}

/** True when the whole query is digits — the condition that offers the filter. */
export function isNumericQuery(q: string): boolean {
  return ALL_DIGITS.test(q.trim());
}

/** The integer a numeric query means, or null if the query is not numeric. */
export function normalizeNumericQuery(q: string): number | null {
  return parseGurmukhiNumber(q);
}

type Word = { text: string; start: number };

/** Splits a line into whitespace-delimited words, keeping each one's offset. */
function splitWords(line: string): Word[] {
  const words: Word[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) words.push({ text: m[0], start: m.index });
  return words;
}

/**
 * Looks back from `wordIndex` for the nearest author/ghar keyword.
 *
 * Two things stop the walk. A danda, because a closed heading's keyword does
 * not reach past it. And an intervening numeral, because a keyword numbers
 * exactly one thing: in ਆਸਾ ਮਹਲਾ ੫ ਦੁਤੁਕੇ ੯ the ੫ is the mahalla and the ੯
 * counts the dutukas, so ਮਹਲਾ must not claim the ੯ as well.
 */
function lookBackForKeyword(
  words: Word[],
  wordIndex: number
): { role: NumeralRole; keyword: string } | null {
  const from = Math.max(0, wordIndex - KEYWORD_LOOKBACK);
  for (let i = wordIndex - 1; i >= from; i--) {
    const text = words[i].text;
    if (DANDA.test(text)) return null;
    if (AUTHOR_KEYWORDS.has(text)) return { role: "author", keyword: text };
    if (GHAR_KEYWORDS.has(text)) return { role: "ghar", keyword: text };
    if (DIGIT_ANYWHERE.test(text)) return null;
  }
  return null;
}

/**
 * Every numeral in a line, left to right, each tagged with the job it does.
 *
 * A numeral is a verse marker when a danda runs into it — either immediately
 * before it inside the same word (॥੧॥, ਹੈਂ॥੧੭੯) or as the whole preceding
 * word (॥ ੧ ॥). Otherwise it is a heading number, typed by the nearest
 * preceding keyword within a short window, and `heading_other` when there is
 * none (ਪਉੜੀ ੧੯, or a bare number opening a title line).
 */
export function extractNumerals(line: string): NumeralOccurrence[] {
  if (!line) return [];
  const words = splitWords(line);
  const out: NumeralOccurrence[] = [];

  words.forEach((word, wordIndex) => {
    DIGIT_RUN.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = DIGIT_RUN.exec(word.text)) !== null) {
      const raw = m[0];
      const value = parseGurmukhiNumber(raw);
      if (value === null) continue;

      // The character a danda would occupy: the one before the run inside this
      // word, or — when the run opens the word — the last character of the
      // previous word.
      const charBefore =
        m.index > 0
          ? word.text[m.index - 1]
          : wordIndex > 0
            ? words[wordIndex - 1].text.slice(-1)
            : "";

      let role: NumeralRole;
      let keyword: string | null = null;
      if (DANDA.test(charBefore)) {
        role = "verse_marker";
      } else {
        const hit = lookBackForKeyword(words, wordIndex);
        role = hit?.role ?? "heading_other";
        keyword = hit?.keyword ?? null;
      }

      out.push({
        value,
        raw,
        start: word.start + m.index,
        end: word.start + m.index + raw.length,
        role,
        keyword,
      });
    }
  });

  return out;
}
