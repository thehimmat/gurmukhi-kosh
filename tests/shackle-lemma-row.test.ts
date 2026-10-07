/**
 * Off-corpus lemma rows the Shackle ingest creates must carry the derived
 * columns every word needs: after the 2026-10-07 re-ingest, 1,271 recreated
 * lemmas had no ipa_display (US-001.2 red) and no search_fold.
 * Run: npm test
 */

import { describe, it, expect } from "vitest";
import { offCorpusLemmaRow } from "../pipeline/shackle/lemma-row";
import { gurmukhiToDisplayIPA } from "../lib/pronounce/gurmukhi-to-ipa";
import { foldGurmukhi } from "../lib/gurmukhi-fold";

describe("offCorpusLemmaRow", () => {
  it("fills pronunciation and the fuzzy-search key", () => {
    const row = offCorpusLemmaRow("ਨਿਰਭਉ", { headword: "nirabhau", printed: true });
    expect(row.ipa_display).toBe(gurmukhiToDisplayIPA("ਨਿਰਭਉ"));
    expect(row.search_fold).toBe(foldGurmukhi("ਨਿਰਭਉ"));
    expect(row.ipa_display).toBeTruthy();
  });

  it("keeps the off-corpus and provenance fields", () => {
    expect(offCorpusLemmaRow("ਕਖ", { headword: "kakha", printed: false })).toMatchObject({
      gurmukhi: "ਕਖ",
      frequency: 0,
      in_corpus: false,
      origin_source: "shackle",
      spelling_status: "derived_transliteration",
      roman_shackle: "kakha",
    });
    expect(offCorpusLemmaRow("ਕਖ", { headword: null, printed: true }).spelling_status).toBe("unverified_ocr");
  });
});
