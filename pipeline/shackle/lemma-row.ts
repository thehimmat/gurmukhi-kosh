// The words row for a Shackle headword no corpus attests. It carries the same
// derived columns as corpus words, so creating it never leaves gaps for
// npm run pronounce / searchfold to fill later (#148).

import { gurmukhiToDisplayIPA } from "../../lib/pronounce/gurmukhi-to-ipa";
import { foldGurmukhi } from "../../lib/gurmukhi-fold";

export function offCorpusLemmaRow(gurmukhi: string, opts: { headword: string | null; printed: boolean }) {
  return {
    gurmukhi,
    frequency: 0,
    in_corpus: false,
    origin_source: "shackle",
    // A Gurmukhi backed by any printed (OCR) entry is 'unverified_ocr'; one seen
    // only via a derived (appendix) entry is 'derived_transliteration'.
    spelling_status: opts.printed ? "unverified_ocr" : "derived_transliteration",
    roman_shackle: opts.headword,
    ipa_display: gurmukhiToDisplayIPA(gurmukhi) || null,
    search_fold: foldGurmukhi(gurmukhi) || null,
  };
}
