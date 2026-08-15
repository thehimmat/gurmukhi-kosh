import { describe, it, expect } from "vitest";
import {
  asParsedSense,
  posLabel,
  posTitle,
  formatGrammarFrame,
  formatCitation,
  formatCitations,
  collectXrefTargets,
  type ParsedCitation,
  type ParsedSense,
} from "../lib/mahan-kosh-parsed";

const citation = (p: Partial<ParsedCitation>): ParsedCitation => ({
  raw: "",
  work: null,
  work_type: null,
  raag: null,
  mahala: null,
  is_vaar: false,
  vaar_number: null,
  section: null,
  bhagat: null,
  work_number: null,
  ...p,
});

describe("asParsedSense", () => {
  it("accepts a parser-stamped object and rejects null/unstamped", () => {
    expect(asParsedSense(null)).toBeNull();
    expect(asParsedSense({ pos: [] })).toBeNull();
    expect(asParsedSense({ parser_version: "1.1.0", pos: [] })).not.toBeNull();
  });
});

describe("posLabel / posTitle", () => {
  it("prettifies snake_case POS values", () => {
    expect(posLabel("noun")).toBe("Noun");
    expect(posLabel("verbal_root")).toBe("Verbal root");
    expect(posLabel("khalsa_argot")).toBe("Khalsa argot");
  });

  it("cites the printed key in the tooltip, matching marker variants via NFD", () => {
    expect(posTitle({ marker: "ਸੰਗ੍ਯਾ", pos: "noun" })).toContain("noun");
    expect(posTitle({ marker: "ਸੰਗ੍ਯਾ", pos: "noun" })).toContain("printed key");
    // Unknown marker still yields an honest tooltip.
    expect(posTitle({ marker: "�झ", pos: "noun" })).toContain("Mahan Kosh marker");
  });
});

describe("formatGrammarFrame", () => {
  it("renders the legend's grammar frames deterministically", () => {
    expect(formatGrammarFrame({ attribute: "number", value: "plural", referent: "ਉਹ" })).toBe("Plural of ਉਹ");
    expect(formatGrammarFrame({ attribute: "number", value: "plural", referent: null })).toBe("Plural");
    expect(formatGrammarFrame({ attribute: "case", value: "vocative", referent: null })).toBe("Vocative");
    expect(formatGrammarFrame({ attribute: "mood", value: "imperative", referent: "ਕਰ" })).toBe("Imperative of ਕਰ");
    expect(formatGrammarFrame({ attribute: "gender", value: "masculine", referent: null })).toBe("Masculine");
    expect(formatGrammarFrame({ attribute: "tense", value: "past", referent: null })).toBe("Past tense");
    expect(formatGrammarFrame({ attribute: "lexical", value: "short_form_of", referent: "ਸਤਿਗੁਰੂ" })).toBe(
      "Short form of ਸਤਿਗੁਰੂ"
    );
  });

  it("falls back to attribute: value for unknown frames", () => {
    expect(formatGrammarFrame({ attribute: "voice", value: "passive", referent: null })).toBe("voice: passive");
  });
});

describe("formatCitation", () => {
  it("decodes a raag + mahala citation via the legend", () => {
    expect(formatCitation(citation({ raw: "ਬਿਲਾ ਮਃ ੩", raag: "ਬਿਲਾ", mahala: 3, work_type: "sggs_raag" }))).toBe(
      "Bilaval, Mahala 3"
    );
  });

  it("decodes vaar citations with and without numbers", () => {
    expect(
      formatCitation(citation({ raw: "ਵਾਰ ਰਾਮ ੨. ਮਃ ੫", raag: "ਰਾਮ", is_vaar: true, vaar_number: 2, mahala: 5 }))
    ).toBe("Vaar of Ramkali 2, Mahala 5");
    expect(formatCitation(citation({ raw: "ਵਾਰ ਮਾਝ ਮਃ ੧", raag: "ਮਾਝ", is_vaar: true, mahala: 1 }))).toBe(
      "Vaar of Majh, Mahala 1"
    );
  });

  it("reads Salok + bhagat as one unit and romanizes the bhagat", () => {
    expect(formatCitation(citation({ raw: "ਸ. ਕਬੀਰ", section: "ਸਲੋਕ", bhagat: "ਕਬੀਰ" }))).toBe("Salok Kabir");
  });

  it("renders a bhagat within a raag", () => {
    expect(
      formatCitation(citation({ raw: "ਆਸਾ ਕਬੀਰ", raag: "ਆਸਾ", bhagat: "ਕਬੀਰ", work_type: "sggs_raag" }))
    ).toBe("Asa, Kabir");
  });

  it("appends the granth for Dasam Granth works and numbers numbered works", () => {
    expect(
      formatCitation(citation({ raw: "ਕ੍ਰਿਸਨਾਵ", work: "Krishna Avtar", work_type: "dasam_granth" }))
    ).toBe("Krishna Avtar (Dasam Granth)");
    expect(
      formatCitation(citation({ raw: "ਚਰਿਤ੍ਰ ੧੦੮", work: "Charitropakhyan", work_type: "dasam_granth", work_number: 108 }))
    ).toBe("Charitropakhyan 108 (Dasam Granth)");
  });

  it("falls back to the raw printed text when nothing decoded", () => {
    expect(formatCitation(citation({ raw: "�XYZ" }))).toBe("�XYZ");
  });
});

describe("formatCitations", () => {
  it("dedupes identical decoded citations, keeping first-appearance order", () => {
    const list = formatCitations([
      citation({ raw: "ਕ੍ਰਿਸਨਾਵ", work: "Krishna Avtar", work_type: "dasam_granth" }),
      citation({ raw: "ਕ੍ਰਿਸਨਾਵ", work: "Krishna Avtar", work_type: "dasam_granth" }),
      citation({ raw: "ਆਸਾ ਮਃ ੫", raag: "ਆਸਾ", mahala: 5 }),
    ]);
    expect(list.map((c) => c.text)).toEqual(["Krishna Avtar (Dasam Granth)", "Asa, Mahala 5"]);
  });
});

describe("collectXrefTargets", () => {
  it("collects NFD-normalized targets across senses, skipping nulls", () => {
    const sense = (targets: string[]): ParsedSense => ({
      parser_version: "1.1.0",
      pos: [],
      language_origins: [],
      grammar: [],
      citations: [],
      quotes: [],
      xrefs: targets.map((t) => ({ target: t, sense_number: null })),
      residue: "",
    } as unknown as ParsedSense);
    // ਖ਼ in NFC composes to U+0A59 only via NFC; NFD keeps ਖ + nukta.
    const out = collectXrefTargets([sense(["ਖ਼ਰਾ".normalize("NFC")]), null, sense(["ਫੀਲੁ"])]);
    expect(out).toContain("ਖ਼ਰਾ");
    expect(out).toContain("ਫੀਲੁ");
    expect(out).toHaveLength(2);
  });
});
