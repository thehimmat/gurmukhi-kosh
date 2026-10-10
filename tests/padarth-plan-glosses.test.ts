import { describe, it, expect } from "vitest";
import { planGlosses, type PlanInput } from "../pipeline/padarth/plan-glosses";

// Lines and pad-arth bodies are verbatim from SGGS / ss_padarth (line ids
// noted). Word, occurrence and lexeme ids are arbitrary but consistent.

let nextWordId = 1000;
const wordIds = new Map<string, number>();
const wid = (g: string) => {
  if (!wordIds.has(g)) wordIds.set(g, nextWordId++);
  return wordIds.get(g)!;
};

function line(lineId: number, text: string) {
  return {
    lineId,
    tokens: text.split(" ").map((g, position) => ({
      occurrenceId: lineId * 100 + position,
      position,
      wordId: wid(g),
      gurmukhi: g,
    })),
  };
}

function input(parts: { line: ReturnType<typeof line>; body: string }[], extra: Partial<PlanInput> = {}): PlanInput {
  return {
    lines: parts.map((p) => p.line),
    padarth: parts.map((p) => ({ lineId: p.line.lineId, body: p.body })),
    lexemesByWord: new Map(),
    wordIdByGurmukhi: new Map([...wordIds.entries()]),
    ...extra,
  };
}

const L5 = line(5, "ਸੋਚੈ ਸੋਚਿ ਨ ਹੋਵਈ ਜੇ ਸੋਚੀ ਲਖ ਵਾਰ");
const L5_BODY =
  "ਸੋਚੈ = ਸੁਚਿ ਰੱਖਣ ਨਾਲ, ਪਵਿੱਤਰਤਾ ਕਾਇਮ ਰੱਖਣ ਨਾਲ। ਸੋਚਿ = ਸੁਚਿ, ਪਵਿੱਤਰਤਾ, ਸੁੱਚ। ਨ ਹੋਵਈ = ਨਹੀਂ ਹੋ ਸਕਦੀ। ਸੋਚੀ = ਮੈਂ ਸੁੱਚ ਰੱਖਾਂ।";

describe("planGlosses", () => {
  it("writes one row per entry, in source order, linked to the words it glosses (line 5)", () => {
    const { glosses } = planGlosses(input([{ line: L5, body: L5_BODY }]));
    expect(glosses.map((g) => [g.ordinal, g.kind, g.term, g.isPhrase])).toEqual([
      [0, "entry", "ਸੋਚੈ", false],
      [1, "entry", "ਸੋਚਿ", false],
      [2, "entry", "ਨ ਹੋਵਈ", true],
      [3, "entry", "ਸੋਚੀ", false],
    ]);
    expect(glosses[2].gloss).toBe("ਨਹੀਂ ਹੋ ਸਕਦੀ");
    expect(glosses[2].links).toEqual([
      { occurrenceId: 502, match: "exact", lexemeId: null },
      { occurrenceId: 503, match: "exact", lexemeId: null },
    ]);
    expect(glosses.every((g) => g.lineId === 5)).toBe(true);
  });

  it("links a gapped phrase to each of its words (line 9)", () => {
    const l9 = line(9, "ਕਿਵ ਸਚਿਆਰਾ ਹੋਈਐ ਕਿਵ ਕੂੜੈ ਤੁਟੈ ਪਾਲਿ");
    const [g] = planGlosses(input([{ line: l9, body: "ਕੂੜੈ ਪਾਲਿ = ਕੂੜ ਦੀ ਪਾਲਿ, ਕੂੜ ਦੀ ਕੰਧ।" }])).glosses;
    expect(g.links.map((k) => [k.occurrenceId, k.match])).toEqual([
      [904, "gapped"],
      [906, "gapped"],
    ]);
  });

  it("links a term in another form through a shared Shackle lexeme (line 7)", () => {
    const l7 = line(7, "ਭੁਖਿਆ ਭੁਖ ਨ ਉਤਰੀ ਜੇ ਬੰਨਾ ਪੁਰੀਆ ਭਾਰ");
    wid("ਪੁਰੀ");
    const plan = planGlosses(
      input([{ line: l7, body: "ਪੁਰੀ = ਲੋਕ, ਭਵਣ। ਪੁਰੀਆ ਭਾਰ = ਸਾਰੇ ਲੋਕਾਂ ਦੇ ਭਾਰ।" }], {
        lexemesByWord: new Map([
          [wid("ਪੁਰੀ"), [77]],
          [wid("ਪੁਰੀਆ"), [77]],
        ]),
      })
    );
    expect(plan.glosses[0].links).toEqual([{ occurrenceId: 706, match: "via_base", lexemeId: 77 }]);
    expect(plan.glosses[1].links.map((k) => k.match)).toEqual(["exact", "exact"]);
  });

  it("leaves a term unlinked when nothing ties it to the line, rather than guessing", () => {
    const l7 = line(7, "ਭੁਖਿਆ ਭੁਖ ਨ ਉਤਰੀ ਜੇ ਬੰਨਾ ਪੁਰੀਆ ਭਾਰ");
    const plan = planGlosses(input([{ line: l7, body: "ਪੁਰੀ = ਲੋਕ, ਭਵਣ।" }]));
    expect(plan.glosses[0].links).toEqual([]);
    expect(plan.stats.unlinked).toBe(1);
  });

  it("keeps spill-over from a neighbouring line stored but unlinked (line 46862)", () => {
    // The heading ਮਃ ੫ carries ਰਜਿ ਰਜਿ, which belongs to line 46864 (which has its own copy).
    const heading = line(46862, "ਮਃ");
    const plan = planGlosses(input([{ line: heading, body: "ਰਜਿ ਰਜਿ = ਰੱਜ ਰੱਜ ਕੇ, ਸੁਆਦ ਨਾਲ" }]));
    expect(plan.glosses).toHaveLength(1);
    expect(plan.glosses[0]).toMatchObject({ lineId: 46862, term: "ਰਜਿ ਰਜਿ", links: [] });
  });

  it("stores text before the first entry as note rows, and entry notes on the entry (line 178)", () => {
    const l178 = line(178, "ਪੁੰਨੀ ਪਾਪੀ ਆਖਣੁ ਨਾਹਿ");
    const { glosses } = planGlosses(
      input([{ line: l178, body: "(1)  ਪੁੰਨੀ ਪਾਪੀ ਆਖਣੁ ਨਾਹਿ। ਨਾਹਿ-ਨਹੀਂ ਹੈ। ਸ਼ਬਦ 'ਨਾਹਿ' ਕਿਰਿਆ ਹੈ।" }])
    );
    expect(glosses.map((g) => [g.ordinal, g.kind, g.term, g.gloss])).toEqual([
      [0, "note", null, "ਪੁੰਨੀ ਪਾਪੀ ਆਖਣੁ ਨਾਹਿ"],
      [1, "entry", "ਨਾਹਿ", "ਨਹੀਂ ਹੈ"],
    ]);
    expect(glosses[1].notes).toEqual(["ਸ਼ਬਦ 'ਨਾਹਿ' ਕਿਰਿਆ ਹੈ"]);
    expect(glosses[0].links).toEqual([]);
  });

  it("attaches case evidence to entries, citing the gloss segment (line 10)", () => {
    const l10 = line(10, "ਹੁਕਮਿ ਰਜਾਈ ਚਲਣਾ ਨਾਨਕ ਲਿਖਿਆ ਨਾਲਿ");
    const { glosses } = planGlosses(input([{ line: l10, body: "ਹੁਕਮਿ = ਹੁਕਮ ਵਿਚ। ਰਜਾਈ = ਰਜ਼ਾ ਵਾਲਾ, ਅਕਾਲ ਪੁਰਖ।" }]));
    expect(glosses[0].caseEvidence).toEqual([{ gramCase: "locative", marker: "ਵਿਚ", basis: "ਹੁਕਮ ਵਿਚ" }]);
    expect(glosses[1].caseEvidence).toEqual([]);
  });

  it("matches the pad-arth's pairin haha against the line's spelling", () => {
    // Line writes ਜਿਨੑ (U+0A51); pad-arth writes ਜਿਨ੍ਹ.
    const l = line(21937, "ਜਿਨੑ ਮਨਿ ਹੋਰੁ");
    const plan = planGlosses(input([{ line: l, body: "ਜਿਨ੍ਹ = ਜਿਨ੍ਹਾਂ ਦੇ।" }]));
    expect(plan.glosses[0].links).toEqual([{ occurrenceId: 2193700, match: "exact", lexemeId: null }]);
  });

  it("counts what it planned", () => {
    const l7 = line(7, "ਭੁਖਿਆ ਭੁਖ ਨ ਉਤਰੀ ਜੇ ਬੰਨਾ ਪੁਰੀਆ ਭਾਰ");
    const { stats } = planGlosses(
      input([
        { line: L5, body: L5_BODY },
        { line: l7, body: "(1) ਨੋਟ। ਪੁਰੀ = ਲੋਕ, ਭਵਣ। ਭਾਰ = ਪਦਾਰਥਾਂ ਦੇ ਸਮੂਹ।" },
      ])
    );
    expect(stats).toEqual({
      rows: 2,
      entries: 6,
      notes: 1,
      phrases: 1,
      linked: 5,
      viaBase: 0,
      unlinked: 1,
      links: 6,
      caseEvidence: expect.any(Number),
    });
  });

  it("still stores pad-arth for a line with no indexed words, unlinked", () => {
    const plan = planGlosses({ ...input([]), padarth: [{ lineId: 999, body: "ਸਚੁ = ਸਦਾ ਥਿਰ।" }] });
    expect(plan.glosses).toMatchObject([{ lineId: 999, term: "ਸਚੁ", links: [] }]);
    expect(plan.stats.rows).toBe(1);
  });
});
