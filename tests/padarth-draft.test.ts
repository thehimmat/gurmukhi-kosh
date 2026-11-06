import { describe, it, expect } from "vitest";
import { draftLine, type DraftInput, type DraftDefinition } from "../lib/padarth/draft";

// Line texts are SGGS as stored; glosses are shortened from the real rows. Ids are arbitrary but
// consistent: word ids are 100 + position unless a test needs a shared word.

function tokens(text: string, ids?: number[]) {
  return text.split(" ").map((gurmukhi, position) => ({ position, wordId: ids?.[position] ?? 100 + position, gurmukhi }));
}

function input(text: string, extra: Partial<DraftInput> = {}, ids?: number[]): DraftInput {
  return { lineId: 1, tokens: tokens(text, ids), definitions: [], formLinks: [], padarth: [], grammar: [], ...extra };
}

let nextId = 1;
function def(wordId: number, sourceCode: string, text: string, extra: Partial<DraftDefinition> = {}): DraftDefinition {
  return { id: nextId++, wordId, sourceCode, senseNumber: 1, text, textEn: null, notes: null, ...extra };
}

const LINE_25 = "ਬਹੁਤਾ ਕਰਮੁ ਲਿਖਿਆ ਨਾ ਜਾਇ";

describe("draftLine", () => {
  it("gives every word a row in line order, even a word repeated in the line", () => {
    const d = draftLine(input("ਕਿਵ ਸਚਿਆਰਾ ਹੋਈਐ ਕਿਵ ਕੂੜੈ ਤੁਟੈ ਪਾਲਿ", {}, [7, 8, 9, 7, 10, 11, 12]));
    expect(d.words.map((w) => [w.position, w.gurmukhi])).toEqual([
      [0, "ਕਿਵ"],
      [1, "ਸਚਿਆਰਾ"],
      [2, "ਹੋਈਐ"],
      [3, "ਕਿਵ"],
      [4, "ਕੂੜੈ"],
      [5, "ਤੁਟੈ"],
      [6, "ਪਾਲਿ"],
    ]);
  });

  it("puts Sahib Singh's gloss for this line first, then dictionaries by source priority and sense", () => {
    const d = draftLine(
      input(LINE_25, {
        definitions: [
          def(101, "mahan_kosh", "ਬਖ਼ਸ਼ਿਸ਼", { senseNumber: 1 }),
          def(101, "sikhri", "grace"),
          def(101, "shackle", "action, deed", { senseNumber: 1 }),
          def(101, "shackle", "grace, favour", { senseNumber: 2 }),
          def(101, "manual", "grace (in this sense)"),
        ],
        padarth: [{ id: 50, ordinal: 1, term: "ਕਰਮੁ", gloss: "ਬਖ਼ਸ਼ਸ਼", notes: [], isPhrase: false, links: [{ position: 1, match: "exact", lexemeId: null }], caseEvidence: [] }],
      })
    );
    const w = d.words[1];
    expect(w.candidates.map((c) => [c.kind, c.sourceCode, c.text])).toEqual([
      ["padarth_gloss", "ss_padarth", "ਬਖ਼ਸ਼ਸ਼"],
      ["definition", "manual", "grace (in this sense)"],
      ["definition", "shackle", "action, deed"],
      ["definition", "shackle", "grace, favour"],
      ["definition", "mahan_kosh", "ਬਖ਼ਸ਼ਿਸ਼"],
      ["definition", "sikhri", "grace"],
    ]);
    expect(w.uncovered).toBe(false);
  });

  it("drops cross-reference-only rows and ranks reverse-transliterated entries last (ਦਰਿ, Pauri 16)", () => {
    const d = draftLine(
      input("ਪੰਚੇ ਸੋਹਹਿ ਦਰਿ ਰਾਜਾਨੁ", {
        definitions: [
          def(102, "shackle", "grind coarsely", { notes: "gurmukhi-derived (reverse-translit)" }),
          def(102, "shackle", "see ਦਰੁ", { notes: "cross-reference-only" }),
          def(102, "mahan_kosh", "(cross-reference)"),
          def(102, "mahan_kosh", "ਦਰ ਉੱਤੇ"),
        ],
      })
    );
    expect(d.words[2].candidates.map((c) => [c.text, c.kind === "definition" && c.lowPriority])).toEqual([
      ["ਦਰ ਉੱਤੇ", false],
      ["grind coarsely", true],
    ]);
  });

  it("takes a form's meaning from the headword Shackle links it to, naming the link (ਹੋਵੈ → ਹੋਇ)", () => {
    const d = draftLine(
      input("ਸੋਚੈ ਸੋਚਿ ਨ ਹੋਵਈ", {
        definitions: [
          def(900, "shackle", "become, happen, occur", { senseNumber: 1 }),
          def(900, "shackle", "be, exist", { senseNumber: 2 }),
          def(900, "mahan_kosh", "ਹੋਣਾ"),
        ],
        formLinks: [{ wordId: 103, lexemeId: 77, headwordWordId: 900, headword: "ਹੋਇ", sourceCode: "shackle", labelRaw: "3 sg. subj.", definitionId: null }],
      })
    );
    const w = d.words[3];
    expect(w.candidates.map((c) => c.text)).toEqual(["become, happen, occur", "be, exist"]);
    expect(w.candidates[0]).toMatchObject({ kind: "definition", via: { headword: "ਹੋਇ", headwordWordId: 900, lexemeId: 77 } });
    expect(w.grammar).toEqual([{ tier: "stated", kind: "form_label", sourceCode: "shackle", text: "3 sg. subj.", headword: "ਹੋਇ" }]);
  });

  it("keeps only the headword sense Shackle names, for a homograph hub", () => {
    const sense = def(901, "shackle", "find, obtain");
    const d = draftLine(
      input("ਪਾਈਐ", {
        definitions: [sense, def(901, "shackle", "put, place")],
        formLinks: [{ wordId: 100, lexemeId: 78, headwordWordId: 901, headword: "ਪਾਇ", sourceCode: "shackle", labelRaw: null, definitionId: sense.id }],
      })
    );
    expect(d.words[0].candidates.map((c) => c.text)).toEqual(["find, obtain"]);
    expect(d.words[0].grammar).toEqual([]);
  });

  it("lists a word's own entries before the headword's", () => {
    const d = draftLine(
      input("ਗੁਣ", {
        definitions: [def(902, "shackle", "quality, virtue"), def(100, "mahan_kosh", "ਗੁਣ")],
        formLinks: [{ wordId: 100, lexemeId: 79, headwordWordId: 902, headword: "ਗੁਣੁ", sourceCode: "shackle", labelRaw: "pl.", definitionId: null }],
      })
    );
    expect(d.words[0].candidates.map((c) => c.text)).toEqual(["ਗੁਣ", "quality, virtue"]);
  });

  it("marks a word with nothing to show as uncovered", () => {
    const d = draftLine(input("ੴ ਸਤਿ"));
    expect(d.words.map((w) => w.uncovered)).toEqual([true, true]);
    expect(d.words[0].candidates).toEqual([]);
  });

  it("puts phrases after the words, with their positions, and not on the words (Pauri 25, line 9)", () => {
    const d = draftLine(
      input(LINE_25, {
        padarth: [
          { id: 60, ordinal: 1, term: "ਲਿਖਿਆ ਨਾ ਜਾਇ", gloss: "ਲਿਖਿਆ ਨਹੀਂ ਜਾ ਸਕਦਾ", notes: [], isPhrase: true, links: [2, 3, 4].map((position) => ({ position, match: "exact" as const, lexemeId: null })), caseEvidence: [] },
        ],
      })
    );
    expect(d.phrases).toEqual([
      { positions: [2, 3, 4], surface: "ਲਿਖਿਆ ਨਾ ਜਾਇ", candidates: [expect.objectContaining({ kind: "padarth_gloss", glossId: 60, text: "ਲਿਖਿਆ ਨਹੀਂ ਜਾ ਸਕਦਾ" })], grammar: [] },
    ]);
    expect(d.words.every((w) => w.candidates.length === 0)).toBe(true);

    const gapped = draftLine(
      input("ਕਿਵ ਸਚਿਆਰਾ ਹੋਈਐ ਕਿਵ ਕੂੜੈ ਤੁਟੈ ਪਾਲਿ", {
        padarth: [{ id: 61, ordinal: 2, term: "ਕੂੜੈ ਪਾਲਿ", gloss: "ਕੂੜ ਦੀ ਕੰਧ", notes: [], isPhrase: true, links: [{ position: 4, match: "gapped", lexemeId: null }, { position: 6, match: "gapped", lexemeId: null }], caseEvidence: [] }],
      })
    );
    expect(gapped.phrases[0]).toMatchObject({ positions: [4, 6], surface: "ਕੂੜੈ … ਪਾਲਿ" });
  });

  it("states grammar a scholar gave, hedges case read from Sahib Singh's postposition, and guesses nothing", () => {
    const d = draftLine(
      input("ਹੁਕਮਿ ਰਜਾਈ ਚਲਣਾ", {
        lineId: 10,
        padarth: [
          {
            id: 70, ordinal: 0, term: "ਹੁਕਮਿ", gloss: "ਹੁਕਮ ਵਿਚ", notes: [], isPhrase: false,
            links: [{ position: 0, match: "exact", lexemeId: null }],
            caseEvidence: [{ gramCase: "locative", marker: "ਵਿਚ", basis: "ਹੁਕਮ ਵਿਚ" }],
          },
        ],
        grammar: [
          { id: 1, wordId: 101, sourceCode: "ss_padarth", provenance: "imported", sourceLineId: 10, pos: null, gender: null, number: "singular", gramCase: null },
          { id: 2, wordId: 101, sourceCode: "ss_padarth", provenance: "imported", sourceLineId: 4000, pos: null, gender: null, number: "plural", gramCase: null },
          { id: 3, wordId: 100, sourceCode: null, provenance: "rule_derived", sourceLineId: null, pos: "noun", gender: "masculine", number: null, gramCase: "direct" },
          { id: 4, wordId: 102, sourceCode: "mahan_kosh", provenance: "scraped", sourceLineId: null, pos: "verb", gender: "masculine", number: null, gramCase: null },
        ],
      })
    );
    expect(d.words[0].grammar).toEqual([
      { tier: "clue", kind: "case", sourceCode: "ss_padarth", glossId: 70, gramCase: "locative", marker: "ਵਿਚ", basis: "ਹੁਕਮ ਵਿਚ" },
    ]);
    // Only the row Sahib Singh wrote on this line, not the one from line 4000.
    expect(d.words[1].grammar).toEqual([
      { tier: "stated", kind: "grammar", sourceCode: "ss_padarth", grammarId: 1, facts: [{ attribute: "number", value: "singular" }] },
    ]);
    // Mahan Kosh states the part of speech only.
    expect(d.words[2].grammar).toEqual([
      { tier: "stated", kind: "grammar", sourceCode: "mahan_kosh", grammarId: 4, facts: [{ attribute: "pos", value: "verb" }] },
    ]);
  });

  it("hedges a phrase's case on the phrase (ਤਾ ਕੇ ਅੰਤ = … ਦੇ ਹੱਦ-ਬੰਨੇ)", () => {
    const d = draftLine(
      input("ਤਾ ਕੇ ਅੰਤ ਨ ਪਾਏ ਜਾਹਿ", {
        padarth: [
          {
            id: 80, ordinal: 0, term: "ਤਾ ਕੇ ਅੰਤ", gloss: "ਉਸ ਅਕਾਲ ਪੁਰਖ ਦੇ ਹੱਦ-ਬੰਨੇ", notes: [], isPhrase: true,
            links: [0, 1, 2].map((position) => ({ position, match: "exact" as const, lexemeId: null })),
            caseEvidence: [{ gramCase: "genitive", marker: "ਦੇ", basis: "ਉਸ ਅਕਾਲ ਪੁਰਖ ਦੇ" }],
          },
        ],
      })
    );
    expect(d.phrases[0].grammar).toEqual([
      { tier: "clue", kind: "case", sourceCode: "ss_padarth", glossId: 80, gramCase: "genitive", marker: "ਦੇ", basis: "ਉਸ ਅਕਾਲ ਪੁਰਖ ਦੇ" },
    ]);
    expect(d.words.every((w) => w.grammar.length === 0)).toBe(true);
  });

  it("labels a pad-arth gloss reached through a Shackle paradigm, and keeps unplaced entries visible", () => {
    const d = draftLine(
      input("ਭੁਖਿਆ ਭੁਖ ਨ ਉਤਰੀ ਜੇ ਬੰਨਾ ਪੁਰੀਆ ਭਾਰ", {
        padarth: [
          { id: 90, ordinal: 0, term: "ਪੁਰੀ", gloss: "ਲੋਕ, ਭਵਣ", notes: [], isPhrase: false, links: [{ position: 6, match: "via_base", lexemeId: 77 }], caseEvidence: [] },
          { id: 91, ordinal: 1, term: "ਸਭੁ ਕੋ", gloss: "ਹਰੇਕ ਜੀਵ", notes: [], isPhrase: true, links: [], caseEvidence: [] },
        ],
      })
    );
    expect(d.words[6].candidates).toEqual([
      { kind: "padarth_gloss", glossId: 90, ordinal: 0, sourceCode: "ss_padarth", term: "ਪੁਰੀ", text: "ਲੋਕ, ਭਵਣ", notes: [], match: "via_base", lexemeId: 77 },
    ]);
    expect(d.unplaced.map((g) => g.term)).toEqual(["ਸਭੁ ਕੋ"]);
  });
});
