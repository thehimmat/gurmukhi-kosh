import { describe, it, expect } from "vitest";
import { draftLine } from "../lib/padarth/draft";
import { candidateKey, fetchCommentary, pickStates, hintsBySurface, type SavedPick } from "../lib/padarth/picks";

const draft = draftLine({
  lineId: 9,
  tokens: "ਕਿਵ ਕੂੜੈ ਤੁਟੈ ਪਾਲਿ".split(" ").map((gurmukhi, position) => ({ position, wordId: 10 + position, gurmukhi })),
  definitions: [
    { id: 1, wordId: 12, sourceCode: "shackle", senseNumber: 1, text: "be broken", textEn: null, notes: null },
    { id: 2, wordId: 12, sourceCode: "mahan_kosh", senseNumber: 1, text: "ਟੁੱਟਣਾ", textEn: null, notes: null },
  ],
  formLinks: [],
  padarth: [
    { id: 60, ordinal: 0, term: "ਕੂੜੈ ਪਾਲਿ", gloss: "ਕੂੜ ਦੀ ਕੰਧ", notes: [], isPhrase: true, links: [{ position: 1, match: "gapped", lexemeId: null }, { position: 3, match: "gapped", lexemeId: null }], caseEvidence: [] },
  ],
  grammar: [],
});

const ref = (kind: "padarth_gloss" | "definition", id: number | null, text: string) => ({
  ordinal: 0,
  refKind: kind,
  sourceCode: kind === "padarth_gloss" ? "ss_padarth" : "shackle",
  padarthGlossId: kind === "padarth_gloss" ? id : null,
  definitionId: kind === "definition" ? id : null,
  snapshotTerm: null,
  snapshotText: text,
});

const pick = (positions: number[], refs: SavedPick["refs"], extra: Partial<SavedPick> = {}): SavedPick => ({
  id: positions[0] + 100,
  lineId: 9,
  positions,
  surfaceText: "x",
  overrideText: null,
  noteText: null,
  refs,
  ...extra,
});

describe("pickStates", () => {
  it("marks the picked candidates of a word and a gapped phrase, and leaves unpicked words empty", () => {
    const states = pickStates(draft, [pick([2], [ref("definition", 2, "ਟੁੱਟਣਾ")]), pick([1, 3], [ref("padarth_gloss", 60, "ਕੂੜ ਦੀ ਕੰਧ")])]);
    expect([...states.words.get(2)!.picked]).toEqual(["definition:2"]);
    expect(states.words.get(0)).toEqual({ pick: null, picked: new Set(), orphans: [] });
    expect([...states.phrases.get("1,3")!.picked]).toEqual(["padarth_gloss:60"]);
  });

  it("keeps a picked ref whose row is gone, or no longer a candidate, as an orphan with its snapshot", () => {
    const gone = ref("definition", null, "be broken (as picked)");
    const moved = ref("definition", 77, "old sense");
    const states = pickStates(draft, [pick([2], [ref("definition", 1, "be broken"), gone, moved])]);
    const w = states.words.get(2)!;
    expect([...w.picked]).toEqual(["definition:1"]);
    expect(w.orphans.map((r) => r.snapshotText)).toEqual(["be broken (as picked)", "old sense"]);
  });

  it("carries a pick with only an override or a note", () => {
    const states = pickStates(draft, [pick([0], [], { overrideText: "how?" })]);
    expect(states.words.get(0)!.pick?.overrideText).toBe("how?");
  });
});

describe("candidateKey", () => {
  it("names a candidate by its kind and row", () => {
    expect(draft.words[2].candidates.map(candidateKey)).toEqual(["definition:1", "definition:2"]);
    expect(draft.phrases[0].candidates.map(candidateKey)).toEqual(["padarth_gloss:60"]);
  });
});

describe("hintsBySurface", () => {
  it("lists what was picked for the same single word on other lines, override first, never this scope's lines", () => {
    const hints = hintsBySurface(
      [
        pick([2], [ref("definition", 1, "be broken")], { lineId: 400, surfaceText: "ਤੁਟੈ" }),
        pick([5], [ref("definition", 2, "ਟੁੱਟਣਾ"), ref("definition", 1, "be broken")], { lineId: 500, surfaceText: "ਤੁਟੈ", overrideText: "breaks" }),
        pick([2], [ref("definition", 1, "here")], { lineId: 9, surfaceText: "ਤੁਟੈ" }),
        pick([1, 3], [ref("padarth_gloss", 60, "phrase")], { lineId: 600, surfaceText: "ਤੁਟੈ" }),
      ],
      new Set([9])
    );
    expect(hints.get("ਤੁਟੈ")).toEqual([
      { lineId: 400, text: "be broken" },
      { lineId: 500, text: "breaks" },
    ]);
  });
});

describe("fetchCommentary", () => {
  const db = (result: { data: unknown; error: { code?: string; message: string } | null }) =>
    ({ from: () => ({ select: () => ({ in: () => ({ order: () => Promise.resolve(result) }) }) }) }) as never;

  it("maps the rows", async () => {
    const out = await fetchCommentary(db({ data: [{ line_id: 5, kind: "introduction", body_text: "Intro" }], error: null }), [5]);
    expect(out).toEqual({ commentary: [{ lineId: 5, kind: "introduction", text: "Intro" }], available: true });
  });

  it("reports the table as unavailable until migration 086 is applied, instead of failing", async () => {
    const out = await fetchCommentary(db({ data: null, error: { code: "PGRST205", message: "Could not find the table" } }), [5]);
    expect(out).toEqual({ commentary: [], available: false });
  });

  it("fails on any other error", async () => {
    await expect(fetchCommentary(db({ data: null, error: { code: "57014", message: "timeout" } }), [5])).rejects.toThrow(/timeout/);
  });
});
