// Etymology extraction (P5) — pure parser over Mahan Kosh definition rows.
//
// The Mahan Kosh scraper (pipeline/mahan-kosh/scrape.py) already tags each sense
// row with an origin-language marker in `cross_refs.origin_lang` (ਸੰ. Sanskrit,
// ਅ਼. Arabic, ਫ਼ਾ. Persian, ਹਿੰ. Hindi, ਪੰ. Punjabi, ਉ. Urdu — see
// extract_cross_refs() there) and, when the source cites a bracketed
// Perso-Arabic form, the exact script in `cross_refs.ar_fa`.
//
// This module turns that into an etymology candidate:
//   - Arabic/Persian: root_form comes directly from cross_refs.ar_fa (already
//     extracted by the scraper — nothing left to parse).
//   - Sanskrit/Hindi: the scraper does NOT pre-extract a root string, because
//     Mahan Kosh sometimes gives the Sanskrit root in Devanagari right after the
//     marker (e.g. "ਸੰ. गुरू ਗੁਰੂ...") and sometimes only paraphrases it in
//     Gurmukhi with no Devanagari at all (e.g. "ਸੰ. ਪੁਰੁਸ."). We scan for a
//     Devanagari run immediately after the marker and return null when there
//     isn't one — an honest omission rather than guessing a root.

export type CrossRefs = { origin_lang?: string; ar_fa?: string } | null;

export interface EtymologyCandidate {
  origin_language: string; // e.g. "Sanskrit"
  root_form: string | null; // script form (Devanagari or Perso-Arabic), if extractable
  source_text: string; // the Mahan Kosh sentence this was read from, verbatim
}

export const ORIGIN_LANGUAGE_NAME: Record<string, string> = {
  sa: "Sanskrit",
  ar: "Arabic",
  fa: "Persian",
  hi: "Hindi",
  pa: "Punjabi",
  ur: "Urdu",
};

// The exact marker strings scrape.py's extract_cross_refs() matches on, so a
// Devanagari scan here stays consistent with why origin_lang was set at all.
const DEVANAGARI_MARKER: Record<string, string> = {
  sa: "ਸੰ.",
  hi: "ਹਿੰ.",
};

const DEVANAGARI_RUN = /^\s*([ऀ-ॿ]+)/;

/**
 * Finds the first Devanagari run immediately following `marker` in `text`, or
 * null if the marker isn't found or nothing Devanagari follows it (Mahan Kosh
 * sometimes only paraphrases the Sanskrit root in Gurmukhi).
 */
export function extractDevanagariRoot(text: string, marker: string): string | null {
  const idx = text.indexOf(marker);
  if (idx === -1) return null;
  const after = text.slice(idx + marker.length);
  const m = after.match(DEVANAGARI_RUN);
  return m ? m[1] : null;
}

/**
 * Builds an etymology candidate for one Mahan Kosh definition row, or null if
 * the row carries no detected origin-language marker.
 */
// scrape.py's "ਉ." (Urdu) marker is a single bare character + period — far
// weaker evidence than the other (multi-character) markers, and it shows up
// as a false positive constantly in practice (34 Mahan Kosh rows tagged "ur";
// only 2 have an actual Perso-Arabic quote to back it up). Rather than fix the
// upstream scraper mid-flight (it's mid-run against the full corpus as of
// 2026-07-01), languages in this set are only accepted when corroborated by
// an actual quoted script excerpt (cross_refs.ar_fa) — no root, no claim.
const REQUIRES_CORROBORATION = new Set(["ur"]);

export function extractEtymologyCandidate(
  definitionText: string,
  crossRefs: CrossRefs
): EtymologyCandidate | null {
  const originLang = crossRefs?.origin_lang;
  if (!originLang) return null;
  const originLanguage = ORIGIN_LANGUAGE_NAME[originLang];
  if (!originLanguage) return null;
  if (REQUIRES_CORROBORATION.has(originLang) && !crossRefs?.ar_fa) return null;

  let rootForm: string | null = null;
  if (crossRefs?.ar_fa) {
    rootForm = crossRefs.ar_fa;
  } else {
    const marker = DEVANAGARI_MARKER[originLang];
    if (marker) rootForm = extractDevanagariRoot(definitionText, marker);
  }

  return { origin_language: originLanguage, root_form: rootForm, source_text: definitionText };
}
