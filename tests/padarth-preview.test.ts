import { describe, it, expect } from "vitest";
import { draftLine } from "../lib/padarth/draft";
import { buildPreview } from "../lib/padarth/preview";
import type { SavedPick } from "../lib/padarth/picks";

// Japji line 5, shortened rows of each kind.
const draft = draftLine({
  lineId: 5,
  tokens: "ਸੋਚੈ ਸੋਚਿ ਨ ਹੋਵਈ ਸੋਚੈ ੴ".split(" ").map((gurmukhi, position) => ({ position, wordId: [1, 2, 3, 4, 1, 6][position], gurmukhi })),
  definitions: [
    { id: 11, wordId: 1, sourceCode: "mahan_kosh", senseNumber: 1, text: "ਸੁਚਿ ਨਾਲ", textEn: null, notes: null },
    { id: 12, wordId: 2, sourceCode: "mahan_kosh", senseNumber: 1, text: "ਪਵਿੱਤਰਤਾ", textEn: null, notes: null },
    { id: 13, wordId: 3, sourceCode: "mahan_kosh", senseNumber: 1, text: "not", textEn: null, notes: null },
    { id: 14, wordId: 900, sourceCode: "shackle", senseNumber: 1, text: "become, happen", textEn: null, notes: null },
  ],
  formLinks: [{ wordId: 4, lexemeId: 7, headwordWordId: 900, headword: "ਹੋਇ", sourceCode: "shackle", labelRaw: "3 sg. subj.", definitionId: null }],
  padarth: [
    { id: 60, ordinal: 0, term: "ਸੋਚੈ", gloss: "ਸੁਚਿ ਰੱਖਣ ਨਾਲ", notes: [], isPhrase: false, links: [{ position: 0, match: "exact", lexemeId: null }], caseEvidence: [{ gramCase: "instrumental", marker: "ਨਾਲ", basis: "ਸੁਚਿ ਰੱਖਣ ਨਾਲ" }] },
    { id: 61, ordinal: 1, term: "ਨ ਹੋਵਈ", gloss: "ਨਹੀਂ ਹੋ ਸਕਦੀ", notes: [], isPhrase: true, links: [2, 3].map((position) => ({ position, match: "exact" as const, lexemeId: null })), caseEvidence: [] },
  ],
  grammar: [],
});
const line = { id: 5, verse_id: 5, gurmukhi: "ਸੋਚੈ ਸੋਚਿ ਨ ਹੋਵਈ ਸੋਚੈ ੴ ॥" };

const ref = (kind: "padarth_gloss" | "definition", id: number, text: string, ordinal = 0) => ({
  ordinal, refKind: kind, sourceCode: "x", padarthGlossId: kind === "padarth_gloss" ? id : null, definitionId: kind === "definition" ? id : null, snapshotTerm: null, snapshotText: text,
});
const pick = (positions: number[], refs: SavedPick["refs"], extra: Partial<SavedPick> = {}): SavedPick => ({
  id: positions[0], lineId: 5, positions, surfaceText: "", overrideText: null, noteText: null, refs, ...extra,
});

describe("buildPreview", () => {
  const [p] = buildPreview(
    [line],
    [draft],
    [
      pick([0], [ref("definition", 11, "ਸੁਚਿ ਨਾਲ", 1), ref("padarth_gloss", 60, "ਸੁਚਿ ਰੱਖਣ ਨਾਲ", 0)]),
      pick([1], [ref("definition", 12, "ਪਵਿੱਤਰਤਾ")], { overrideText: "purity, cleanliness", noteText: "outer purity" }),
      pick([2, 3], [ref("padarth_gloss", 61, "ਨਹੀਂ ਹੋ ਸਕਦੀ")]),
    ],
    new Map([[5, "the strong bull of Dharam"]])
  );

  it("gives every word a row, in order, repeats included", () => {
    expect(p.gurmukhi).toBe(line.gurmukhi);
    expect(p.rows.map((r) => r.surface)).toEqual(["ਸੋਚੈ", "ਸੋਚਿ", "ਨ", "ਹੋਵਈ", "ਸੋਚੈ", "ੴ"]);
  });

  it("uses the picks in their saved order, joined with ; ", () => {
    expect(p.rows[0]).toMatchObject({ status: "picked", text: "ਸੁਚਿ ਰੱਖਣ ਨਾਲ; ਸੁਚਿ ਨਾਲ" });
  });

  it("prefers the curator's own wording, and carries the item's note", () => {
    expect(p.rows[1]).toMatchObject({ status: "override", text: "purity, cleanliness", note: "outer purity" });
  });

  it("falls back to the top gloss, marked as unpicked, and to nothing when there is none", () => {
    // The second ਸੋਚੈ has no pick of its own: a pick on one occurrence never fills another.
    // Sahib Singh's gloss is linked to the first only, so its top gloss is Mahan Kosh's.
    expect(p.rows[4]).toMatchObject({ status: "draft", text: "ਸੁਚਿ ਨਾਲ" });
    expect(p.rows[5]).toMatchObject({ status: "uncovered", text: null });
  });

  it("adds what a scholar states as a parenthetical, and leaves hedged clues out", () => {
    expect(p.rows[3]).toMatchObject({ status: "draft", text: "become, happen", grammar: ["3 sg. subj. of ਹੋਇ"] });
    expect(p.rows[0].grammar).toEqual([]);
  });

  it("puts phrase rows after the words, and the line note last", () => {
    expect(p.phrases).toEqual([expect.objectContaining({ surface: "ਨ ਹੋਵਈ", status: "picked", text: "ਨਹੀਂ ਹੋ ਸਕਦੀ" })]);
    expect(p.note).toBe("the strong bull of Dharam");
  });

  it("states grammar from Shackle and Sahib Singh only, not Mahan Kosh's part of speech", () => {
    const d = draftLine({
      lineId: 6,
      tokens: [{ position: 0, wordId: 1, gurmukhi: "ਸੋਚੈ" }],
      definitions: [],
      formLinks: [],
      padarth: [],
      grammar: [
        { id: 1, wordId: 1, sourceCode: "mahan_kosh", provenance: "imported", sourceLineId: null, pos: "ਸੰਗ੍ਯਾ", gender: null, number: null, gramCase: null },
        { id: 2, wordId: 1, sourceCode: "ss_padarth", provenance: "imported", sourceLineId: 6, pos: null, gender: null, number: "singular", gramCase: null },
        { id: 3, wordId: 1, sourceCode: "shackle", provenance: "imported", sourceLineId: null, pos: "verb", gender: null, number: null, gramCase: null },
      ],
    });
    const [q] = buildPreview([{ id: 6, verse_id: 6, gurmukhi: "ਸੋਚੈ" }], [d], [], new Map());
    expect(q.rows[0].grammar).toEqual(["singular", "verb"]);
  });
});
