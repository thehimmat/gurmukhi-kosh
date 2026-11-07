// Orthographic fold for fuzzy word search (#63).
//
// Folds a Gurmukhi string to a lossy key on which spelling variants collide:
// dental/retroflex pairs, nukta letters, vowel length, nasal signs, and the
// grammatical final short matra (the highest-value fold — ਸਭ/ਸਭੁ — measured
// on the #33 witness analysis). Both the stored key (words.search_fold) and
// the typed query are folded with the same function; matching is
// prefix-on-key so the search dropdown stays fuzzy while typing.
//
// This key is owned by kosh's text search. It is distinct from
// words.phonetic_ipa, the speech-tuned IPA key owned by gurmukhi-voice-search
// (see APP_INTERACTIONS.md), and from ipa_display, the faithful display IPA.
//
// All matching is done in NFD (decomposed nukta; U+0A59-5E are
// composition-excluded, so NFC round-trips would miss them).

// Retroflex → dental series, plus ੜ → ਰ (they alternate across spelling
// variants; this is a fuzzy tier, ranked below exact matches).
// The consonant and nasal folds are spelling only; the vowel folds also merge grammatical
// endings (foldSpelling leaves them out).
const SPELLING_FOLD: Record<string, string> = {
  "ਟ": "ਤ",
  "ਠ": "ਥ",
  "ਡ": "ਦ",
  "ਢ": "ਧ",
  "ਣ": "ਨ",
  "ੜ": "ਰ",
  // Nasal signs: bindi and adak-bindi fold to tippi.
  "ਂ": "ੰ",
  "ਁ": "ੰ",
};

const VOWEL_FOLD: Record<string, string> = {
  // Long → short vowels, dependent then independent.
  "ੀ": "ਿ", // ੀ → ਿ
  "ੂ": "ੁ", // ੂ → ੁ
  "ੈ": "ੇ", // ੈ → ੇ
  "ੌ": "ੋ", // ੌ → ੋ
  "ਈ": "ਇ",
  "ਊ": "ਉ",
  "ਐ": "ਏ",
  "ਔ": "ਓ",
};

const CHAR_FOLD: Record<string, string> = { ...SPELLING_FOLD, ...VOWEL_FOLD };

// Dropped outright: nukta (ਖ਼→ਖ etc. — NFD decomposes U+0A59-5E first),
// adhak (gemination), visarga (ਦੁਃਖ/ਦੁਖ), udaat/yakash, and joiners.
const DROP = /[਼ੱਃੑੵ‌‍]/g;

// One trailing short matra (aunkar/sihari) — the grammatical ending whose
// presence varies most across spellings and quotations.
const FINAL_SHORT_MATRA = /[ੁਿ]$/;

function fold(s: string, map: Record<string, string>): string {
  return Array.from(
    s
      .normalize("NFD")
      .replace(DROP, "")
      // Keep only the Gurmukhi block plus space — punctuation, digits, and
      // Latin in a query must not poison the key.
      .replace(/[^\u0A00-\u0A7F ]/g, "")
      .trim(),
    (ch) => map[ch] ?? ch
  ).join("");
}

/** Folds Gurmukhi to the lossy search key. Non-Gurmukhi input folds to "". */
export function foldGurmukhi(s: string): string {
  return fold(s, CHAR_FOLD).replace(FINAL_SHORT_MATRA, "");
}

/**
 * The stricter key the pad-arth's spelling-variant tier matches on (#377): consonant spellings
 * (ਣ/ਨ, retroflex/dental, ੜ/ਰ), nasal signs and the dropped marks (nukta, adhak, visarga), but
 * not vowel length or the final short matra, which carry grammar. Never looser than foldGurmukhi.
 */
export function foldSpelling(s: string): string {
  return fold(s, SPELLING_FOLD);
}
