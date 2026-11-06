import { describe, it, expect } from "vitest";
import { draftLine } from "../lib/padarth/draft";
import { flatItems, initialPicks, itemKey, toggleChoice, withText, saveInput, isEmpty, choiceOf } from "../lib/padarth/builder-state";
import type { SavedPick } from "../lib/padarth/picks";

const draft = draftLine({
  lineId: 9,
  tokens: "ਕਿਵ ਕੂੜੈ ਤੁਟੈ ਪਾਲਿ".split(" ").map((gurmukhi, position) => ({ position, wordId: 10 + position, gurmukhi })),
  definitions: [
    { id: 1, wordId: 12, sourceCode: "shackle", senseNumber: 1, text: "be broken", textEn: null, notes: null },
    { id: 2, wordId: 12, sourceCode: "mahan_kosh", senseNumber: 1, text: "ਟੁੱਟਣਾ", textEn: null, notes: null },
    { id: 3, wordId: 12, sourceCode: "mahan_kosh", senseNumber: 2, text: "ਨਸ਼ਟ ਹੋਣਾ", textEn: null, notes: null },
  ],
  formLinks: [],
  padarth: [
    { id: 60, ordinal: 0, term: "ਕੂੜੈ ਪਾਲਿ", gloss: "ਕੂੜ ਦੀ ਕੰਧ", notes: [], isPhrase: true, links: [{ position: 1, match: "gapped", lexemeId: null }, { position: 3, match: "gapped", lexemeId: null }], caseEvidence: [] },
  ],
  grammar: [],
});
const tutai = draft.words[2];
const order = tutai.candidates.map(choiceOf);

describe("flatItems", () => {
  it("walks each line's words in order, then its phrases", () => {
    expect(flatItems([draft]).map((i) => [i.kind, i.positions, i.surface])).toEqual([
      ["word", [0], "ਕਿਵ"],
      ["word", [1], "ਕੂੜੈ"],
      ["word", [2], "ਤੁਟੈ"],
      ["word", [3], "ਪਾਲਿ"],
      ["phrase", [1, 3], "ਕੂੜੈ … ਪਾਲਿ"],
    ]);
  });
});

describe("toggleChoice", () => {
  it("adds and removes a choice, keeping the candidates' order whatever order they were clicked", () => {
    let p = toggleChoice(undefined, order[2], order);
    p = toggleChoice(p, order[0], order);
    expect(p.refs).toEqual([order[0], order[2]]);
    p = toggleChoice(p, order[0], order);
    expect(p.refs).toEqual([order[2]]);
  });

  it("keeps a chosen ref that is no longer a candidate, after the candidates", () => {
    const p = toggleChoice({ refs: [{ kind: "definition", id: 77 }], override: null, note: null, orphans: [] }, order[1], order);
    expect(p.refs).toEqual([order[1], { kind: "definition", id: 77 }]);
  });
});

describe("initialPicks", () => {
  it("restores saved picks by line and positions, keeping refs whose row is gone as orphans only", () => {
    const saved: SavedPick[] = [
      {
        id: 1, lineId: 9, positions: [2], surfaceText: "ਤੁਟੈ", overrideText: "breaks", noteText: null,
        refs: [
          { ordinal: 0, refKind: "definition", sourceCode: "mahan_kosh", padarthGlossId: null, definitionId: 3, snapshotTerm: "ਤੁਟੈ", snapshotText: "ਨਸ਼ਟ ਹੋਣਾ" },
          { ordinal: 1, refKind: "definition", sourceCode: "shackle", padarthGlossId: null, definitionId: null, snapshotTerm: "ਤੁਟੈ", snapshotText: "old" },
        ],
      },
    ];
    const picks = initialPicks([draft], saved);
    expect(picks.get(itemKey(9, [2]))).toEqual({
      refs: [{ kind: "definition", id: 3 }],
      override: "breaks",
      note: null,
      orphans: [expect.objectContaining({ snapshotText: "old" })],
    });
    expect(picks.has(itemKey(9, [0]))).toBe(false);
  });
});

describe("withText, isEmpty and saveInput", () => {
  it("treats blank text as none, and a pick with nothing left as empty", () => {
    const p = withText(undefined, "override", "   ");
    expect(p.override).toBeNull();
    expect(isEmpty(p)).toBe(true);
    expect(isEmpty(withText(p, "note", "see ਤੁਟਿ"))).toBe(false);
  });

  it("builds the server action's input for an item", () => {
    const item = flatItems([draft])[4];
    const p = toggleChoice(undefined, { kind: "padarth_gloss", id: 60 }, draft.phrases[0].candidates.map(choiceOf));
    expect(saveInput(item, p)).toEqual({
      lineId: 9, positions: [1, 3], surface: "ਕੂੜੈ … ਪਾਲਿ",
      refs: [{ kind: "padarth_gloss", id: 60 }], overrideText: null, noteText: null,
    });
  });
});
