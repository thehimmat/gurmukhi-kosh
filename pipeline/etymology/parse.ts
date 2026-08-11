// Etymology extraction (P5) — pure mapping from the structured Mahan Kosh
// parse (definitions.parsed.language_origins) to etymology candidates.
//
// Until #48 this read only cross_refs.origin_lang — the FIRST origin — so a
// chained marker run (ਫ਼ਾ. [سیب] … ਅੰ. Apple) produced a single row and 49
// senses whose origin language has no ISO code never produced one at all.
// The parsed layer carries the full ordered origin list, and
// etymology.order_index already models a chain, so every origin becomes a
// candidate in print order.

export interface EtymologyCandidate {
  origin_language: string; // e.g. "Sanskrit"
  root_form: string | null; // the etymon as printed (Devanagari / Perso-Arabic / Latin), if any
  root_script: string | null; // etymon script, decides which external dictionary applies
  source_text: string; // the Mahan Kosh sense this was read from, verbatim
}

// One entry of parsed.language_origins as parse_shorthand.py emits it.
export type ParsedOrigin = {
  marker: string;
  language: string;
  iso639: string | null;
  etymon: { text: string; script: string; inferred?: boolean } | null;
};

// Display names for the canonical legend's ISO codes (pipeline/mahan-kosh/
// abbreviations.json language_markers). Preferred over the parser's `language`
// field, which sometimes carries the legend's verbose gloss ("Braj Bhasha",
// "Marathi (Maharashtri)"); the parser name is the fallback for the handful of
// markers with no ISO code (Pahari, Purbi, Thali, Dingal).
export const ORIGIN_LANGUAGE_NAME: Record<string, string> = {
  sa: "Sanskrit",
  ar: "Arabic",
  fa: "Persian",
  hi: "Hindi",
  tr: "Turkish",
  sd: "Sindhi",
  pra: "Prakrit",
  pi: "Pali",
  en: "English",
  mr: "Marathi",
  el: "Greek",
  he: "Hebrew",
  fr: "French",
  la: "Latin",
  pt: "Portuguese",
  gu: "Gujarati",
  ks: "Kashmiri",
  mag: "Magadhi",
  mwr: "Marwari",
  skr: "Multani (Saraiki)",
  phr: "Pothohari",
  bgc: "Bangru",
  dcc: "Dakhani",
  cdh: "Chambeali",
  bra: "Braj",
};

// Scripts whose etymon text is the source word as printed. A `gurmukhi`
// etymon is the parser's inference that a Gurmukhi token transcribes the
// etymon (flagged inferred: true) — our reading, not Kahn Singh's print — so
// it never becomes root_form (#48: printed forms are his, transcriptions are
// ours and must not be presented as print).
const PRINTED_ETYMON_SCRIPTS = new Set(["devanagari", "perso_arabic", "latin"]);

/**
 * Maps one sense's ordered origin list to etymology candidates, in print
 * order. Origins are never dropped for lacking an etymon — an origin-language
 * claim with no printed root is still Kahn Singh's claim (root_form null is
 * the honest omission).
 */
export function extractEtymologyCandidates(
  definitionText: string,
  languageOrigins: ParsedOrigin[] | null | undefined
): EtymologyCandidate[] {
  const out: EtymologyCandidate[] = [];
  for (const o of languageOrigins ?? []) {
    const originLanguage = (o.iso639 && ORIGIN_LANGUAGE_NAME[o.iso639]) || o.language;
    if (!originLanguage) continue;

    const printed = o.etymon && !o.etymon.inferred && PRINTED_ETYMON_SCRIPTS.has(o.etymon.script);
    out.push({
      origin_language: originLanguage,
      root_form: printed ? o.etymon!.text : null,
      root_script: printed ? o.etymon!.script : null,
      source_text: definitionText,
    });
  }
  return out;
}
