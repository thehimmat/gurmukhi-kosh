import { describe, it, expect } from "vitest";
import { buildDraftInputs, type DraftRows } from "../lib/padarth/fetch";

// Raw rows in the shape the queries return them; ids are arbitrary but consistent.
const rows = (extra: Partial<DraftRows> = {}): DraftRows => ({
  lines: [
    { id: 9, verse_id: 9, gurmukhi: "ਕਿਵ ਕੂੜੈ ਤੁਟੈ ਪਾਲਿ" },
    { id: 5, verse_id: 5, gurmukhi: "ਨ ਹੋਵਈ" },
  ],
  occurrences: [
    { id: 903, line_id: 9, position: 3, word_id: 13, words: { gurmukhi: "ਪਾਲਿ" } },
    { id: 900, line_id: 9, position: 0, word_id: 10, words: { gurmukhi: "ਕਿਵ" } },
    { id: 901, line_id: 9, position: 1, word_id: 11, words: { gurmukhi: "ਕੂੜੈ" } },
    { id: 902, line_id: 9, position: 2, word_id: 12, words: { gurmukhi: "ਤੁਟੈ" } },
    { id: 500, line_id: 5, position: 0, word_id: 20, words: { gurmukhi: "ਨ" } },
    { id: 501, line_id: 5, position: 1, word_id: 21, words: { gurmukhi: "ਹੋਵਈ" } },
  ],
  definitions: [],
  formLinks: [],
  headwords: [],
  pointerTargets: [],
  variantWords: [],
  padarth: [],
  grammar: [],
  ...extra,
});

describe("buildDraftInputs", () => {
  it("returns one input per line, in reading order, with its words by position", () => {
    const inputs = buildDraftInputs(rows());
    expect(inputs.map((i) => i.lineId)).toEqual([5, 9]);
    expect(inputs[1].tokens).toEqual([
      { position: 0, wordId: 10, gurmukhi: "ਕਿਵ" },
      { position: 1, wordId: 11, gurmukhi: "ਕੂੜੈ" },
      { position: 2, wordId: 12, gurmukhi: "ਤੁਟੈ" },
      { position: 3, wordId: 13, gurmukhi: "ਪਾਲਿ" },
    ]);
  });

  it("maps definitions with their source code, to each line that uses the word or its headword", () => {
    const inputs = buildDraftInputs(
      rows({
        definitions: [
          { id: 1, word_id: 12, sense_number: 1, definition_text: "be broken", definition_en: null, notes: null, dict_sources: { code: "shackle" } },
          { id: 2, word_id: 800, sense_number: 1, definition_text: "become", definition_en: null, notes: null, dict_sources: { code: "shackle" } },
          { id: 3, word_id: 999, sense_number: 1, definition_text: "unrelated", definition_en: null, notes: null, dict_sources: { code: "shackle" } },
        ],
        formLinks: [
          { word_id: 21, lexeme_id: 70, source_code: "shackle", label_raw: "3 sg.", features: { definition_id: 2 }, lexemes: { root_word_id: 800 } },
        ],
        headwords: [{ id: 800, gurmukhi: "ਹੋਇ" }],
      })
    );
    const [l5, l9] = inputs;
    expect(l9.definitions).toEqual([{ id: 1, wordId: 12, sourceCode: "shackle", senseNumber: 1, text: "be broken", textEn: null, notes: null }]);
    expect(l5.definitions.map((d) => d.id)).toEqual([2]);
    expect(l5.formLinks).toEqual([
      { wordId: 21, lexemeId: 70, headwordWordId: 800, headword: "ਹੋਇ", sourceCode: "shackle", labelRaw: "3 sg.", definitionId: 2 },
    ]);
  });

  it("drops a hub's own headword row and a link whose headword is the word itself", () => {
    const inputs = buildDraftInputs(
      rows({
        formLinks: [
          { word_id: 21, lexeme_id: 70, source_code: "shackle", label_raw: null, features: { headword: true }, lexemes: { root_word_id: 800 } },
          { word_id: 20, lexeme_id: 71, source_code: "shackle", label_raw: null, features: {}, lexemes: { root_word_id: 20 } },
        ],
        headwords: [{ id: 800, gurmukhi: "ਹੋਇ" }],
      })
    );
    expect(inputs[0].formLinks).toEqual([]);
  });

  it("places pad-arth links by occurrence, keeping only links onto the gloss's own line", () => {
    const inputs = buildDraftInputs(
      rows({
        padarth: [
          {
            id: 61, line_id: 9, ordinal: 2, term: "ਕੂੜੈ ਪਾਲਿ", gloss: "ਕੂੜ ਦੀ ਕੰਧ", notes: [], is_phrase: true,
            padarth_gloss_occurrences: [
              { word_occurrence_id: 903, match: "gapped", lexeme_id: null },
              { word_occurrence_id: 901, match: "gapped", lexeme_id: null },
              { word_occurrence_id: 500, match: "exact", lexeme_id: null },
            ],
            padarth_case_evidence: [{ gram_case: "genitive", marker: "ਦੀ", basis: "ਕੂੜ ਦੀ" }],
          },
        ],
      })
    );
    expect(inputs[1].padarth).toEqual([
      {
        id: 61, ordinal: 2, term: "ਕੂੜੈ ਪਾਲਿ", gloss: "ਕੂੜ ਦੀ ਕੰਧ", notes: [], isPhrase: true,
        links: [
          { position: 1, match: "gapped", lexemeId: null },
          { position: 3, match: "gapped", lexemeId: null },
        ],
        caseEvidence: [{ gramCase: "genitive", marker: "ਦੀ", basis: "ਕੂੜ ਦੀ" }],
      },
    ]);
    expect(inputs[0].padarth).toEqual([]);
  });

  it("maps grammar rows to each line that uses the word", () => {
    const inputs = buildDraftInputs(
      rows({
        grammar: [
          { id: 4, word_id: 12, source_code: "mahan_kosh", provenance: "scraped", source_line_id: null, pos: "verb", gender: null, number: null, gram_case: null, person: null, verb_form: null },
        ],
      })
    );
    expect(inputs[1].grammar).toEqual([
      { id: 4, wordId: 12, sourceCode: "mahan_kosh", provenance: "scraped", sourceLineId: null, pos: "verb", gender: null, number: null, gramCase: null, person: null, verbForm: null },
    ]);
    expect(inputs[0].grammar).toEqual([]);
  });

  it("brings in the entries Mahan Kosh pointer rows name, on the lines whose words point at them", () => {
    const inputs = buildDraftInputs(
      rows({
        definitions: [
          { id: 1, word_id: 12, sense_number: 1, definition_text: "ਦੇਖੋ, ਤੁਟਣਾ.", definition_en: null, notes: null, dict_sources: { code: "mahan_kosh" } },
          { id: 2, word_id: 850, sense_number: 1, definition_text: "ਟੁੱਟਣਾ", definition_en: null, notes: null, dict_sources: { code: "mahan_kosh" } },
        ],
        pointerTargets: [{ id: 850, gurmukhi: "ਤੁਟਣਾ" }],
      })
    );
    const [l5, l9] = inputs;
    expect(l9.definitions.map((d) => d.id)).toEqual([1, 2]);
    expect(l9.mkPointerTargets).toEqual([{ target: "ਤੁਟਣਾ", wordId: 850 }]);
    expect(l5.definitions).toEqual([]);
    expect(l5.mkPointerTargets).toEqual([]);
  });

  it("finds a line word's spelling variants by fold key, tiered, and brings in their senses", () => {
    const inputs = buildDraftInputs(
      rows({
        // ਪਾਲਿ (13) has no definition of its own.
        definitions: [
          { id: 7, word_id: 870, sense_number: 1, definition_text: "wall", definition_en: null, notes: null, dict_sources: { code: "shackle" } },
          { id: 8, word_id: 871, sense_number: 1, definition_text: "ridge", definition_en: null, notes: null, dict_sources: { code: "shackle" } },
        ],
        variantWords: [
          { id: 870, gurmukhi: "ਪਾਲ" },
          { id: 871, gurmukhi: "ਪਾਲੀ" },
          { id: 872, gurmukhi: "ਕਿਵੈ" },
        ],
      })
    );
    const l9 = inputs[1];
    expect(l9.variants).toEqual([
      { wordId: 13, variantWordId: 870, variant: "ਪਾਲ", tier: "ending" },
      { wordId: 13, variantWordId: 871, variant: "ਪਾਲੀ", tier: "ending" },
    ]);
    expect(l9.definitions.map((d) => d.id)).toEqual([7, 8]);
    expect(inputs[0].variants).toEqual([]);
  });
});
