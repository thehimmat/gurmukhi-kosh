import { describe, it, expect } from "vitest";
import { assemblePassage, type AssembleInput } from "../lib/padarth/assemble";
import { tokenize } from "../lib/tokenizer";

// Fixtures: real SGGS lines and pad-arth; dictionary rows are short stand-ins
// shaped like the definitions table (word ids are arbitrary but consistent).

let nextWordId = 100;
const wordIds = new Map<string, number>();
const wid = (g: string) => {
  if (!wordIds.has(g)) wordIds.set(g, nextWordId++);
  return wordIds.get(g)!;
};

function line(id: number, gurmukhi: string, ang = 1, lineNo = 5) {
  return {
    line: { id, ang, lineNo, gurmukhi },
    occurrences: tokenize(gurmukhi).map((g, position) => ({ lineId: id, position, wordId: wid(g), gurmukhi: g })),
  };
}

function input(parts: ReturnType<typeof line>[], extra: Partial<AssembleInput> = {}): AssembleInput {
  return {
    lines: parts.map((p) => p.line),
    occurrences: parts.flatMap((p) => p.occurrences),
    definitions: [],
    phraseDefinitions: [],
    baseForms: [],
    grammar: [],
    translations: [],
    dictSourceOrder: ["mahan_kosh", "shackle"],
    translationOrder: ["manmohan_en", "manmohan_pa"],
    ...extra,
  };
}

const SOCHAI = line(5, "ਸੋਚੈ ਸੋਚਿ ਨ ਹੋਵਈ ਜੇ ਸੋਚੀ ਲਖ ਵਾਰ ॥");
const SOCHAI_PADARTH =
  "ਸੋਚੈ = ਸੁਚਿ ਰੱਖਣ ਨਾਲ, ਪਵਿੱਤਰਤਾ ਕਾਇਮ ਰੱਖਣ ਨਾਲ। ਸੋਚਿ = ਸੁਚਿ, ਪਵਿੱਤਰਤਾ, ਸੁੱਚ। ਨ ਹੋਵਈ = ਨਹੀਂ ਹੋ ਸਕਦੀ। ਸੋਚੀ = ਮੈਂ ਸੁੱਚ ਰੱਖਾਂ।";

describe("assemblePassage", () => {
  const base = input([SOCHAI], {
    definitions: [
      { wordId: wid("ਸੋਚਿ"), source: "mahan_kosh", senseNumber: 2, text: "ਸ਼ੁੱਧਤਾ", textEn: null },
      { wordId: wid("ਸੋਚਿ"), source: "mahan_kosh", senseNumber: 1, text: "ਸੋਚ ਕੇ", textEn: null },
      { wordId: wid("ਸੋਚ"), source: "mahan_kosh", senseNumber: 1, text: "ਪਵਿਤ੍ਰਤਾ", textEn: null },
      { wordId: wid("ਸੋਚ"), source: "shackle", senseNumber: 1, text: "purity", textEn: null },
    ],
    baseForms: [
      { wordId: wid("ਸੋਚੈ"), base: "ਸੋਚ", baseWordId: wid("ਸੋਚ"), basis: "shackle_see" },
      { wordId: wid("ਸੋਚਿ"), base: "ਸੋਚ", baseWordId: wid("ਸੋਚ"), basis: "shackle_see" },
    ],
    grammar: [{ wordId: wid("ਸੋਚਿ"), pos: "noun", gender: "feminine", number: null, gramCase: null, sourceCode: "mahan_kosh" }],
    translations: [
      { lineId: 5, sourceCode: "manmohan_pa", body: "ਪੰਜਾਬੀ" },
      { lineId: 5, sourceCode: "ss_padarth", body: SOCHAI_PADARTH },
      { lineId: 5, sourceCode: "manmohan_en", body: "English" },
    ],
  });
  const [out] = assemblePassage(base).lines;

  it("keeps the line, its words in order, and translations in the given order", () => {
    expect(out.gurmukhi).toBe("ਸੋਚੈ ਸੋਚਿ ਨ ਹੋਵਈ ਜੇ ਸੋਚੀ ਲਖ ਵਾਰ ॥");
    expect(out.words.map((w) => w.gurmukhi)).toEqual(["ਸੋਚੈ", "ਸੋਚਿ", "ਨ", "ਹੋਵਈ", "ਜੇ", "ਸੋਚੀ", "ਲਖ", "ਵਾਰ"]);
    expect(out.translations.map((t) => t.sourceCode)).toEqual(["manmohan_en", "manmohan_pa"]);
    expect(out.padarthRaw).toBe(SOCHAI_PADARTH);
  });

  it("puts a word's own senses first, ordered by sense number", () => {
    expect(out.words[1].glosses[0]).toEqual({
      source: "mahan_kosh",
      via: null,
      senses: [
        { senseNumber: 1, text: "ਸੋਚ ਕੇ", textEn: null },
        { senseNumber: 2, text: "ਸ਼ੁੱਧਤਾ", textEn: null },
      ],
    });
  });

  it("falls back to the base form per source, labelled with the base and its basis", () => {
    // ਸੋਚਿ has its own Mahan Kosh senses, so only Shackle comes via ਸੋਚ.
    expect(out.words[1].glosses.map((g) => [g.source, g.via?.base ?? null])).toEqual([
      ["mahan_kosh", null],
      ["shackle", "ਸੋਚ"],
    ]);
    // ਸੋਚੈ has nothing of its own, so both sources come via ਸੋਚ.
    expect(out.words[0].glosses).toEqual([
      { source: "mahan_kosh", via: { base: "ਸੋਚ", basis: "shackle_see" }, senses: [{ senseNumber: 1, text: "ਪਵਿਤ੍ਰਤਾ", textEn: null }] },
      { source: "shackle", via: { base: "ਸੋਚ", basis: "shackle_see" }, senses: [{ senseNumber: 1, text: "purity", textEn: null }] },
    ]);
  });

  it("attaches single-word pad-arth to the word and phrases to a phrase", () => {
    expect(out.words[0].padarth.map((p) => p.gloss)).toEqual(["ਸੁਚਿ ਰੱਖਣ ਨਾਲ, ਪਵਿੱਤਰਤਾ ਕਾਇਮ ਰੱਖਣ ਨਾਲ"]);
    expect(out.words[5].padarth.map((p) => p.term)).toEqual(["ਸੋਚੀ"]);
    expect(out.phrases).toEqual([
      {
        positions: [2, 3],
        text: "ਨ ਹੋਵਈ",
        padarth: [{ term: "ਨ ਹੋਵਈ", gloss: "ਨਹੀਂ ਹੋ ਸਕਦੀ", notes: [], match: "exact", borrowedFromLineId: null }],
        glosses: [],
      },
    ]);
    expect(out.padarthUnplaced).toEqual([]);
  });

  it("passes grammar through and marks words with no gloss at all", () => {
    expect(out.words[1].grammar).toEqual([
      { pos: "noun", gender: "feminine", number: null, gramCase: null, sourceCode: "mahan_kosh" },
    ]);
    expect(out.words[2].covered).toBe(true); // ਨ: inside the phrase ਨ ਹੋਵਈ
    expect(out.words[4].covered).toBe(false); // ਜੇ: nothing anywhere
    expect(out.words[5].covered).toBe(true);
  });

  it("borrows pad-arth that belongs to another line of the passage", () => {
    // BaniDB attaches this pad-arth to the heading line before the verse.
    const heading = line(46862, "ਮਃ ੫ ॥");
    const verse = line(46863, "ਰਜਿ ਰਜਿ ਭੋਜਨੁ ਖਾਵਹੁ ਮੇਰੇ ਭਾਈ ॥");
    const passage = assemblePassage(
      input([heading, verse], {
        translations: [{ lineId: 46862, sourceCode: "ss_padarth", body: "ਰਜਿ ਰਜਿ = ਰੱਜ ਰੱਜ ਕੇ, ਸੁਆਦ ਨਾਲ" }],
      })
    );
    expect(passage.lines[0].padarthUnplaced).toEqual([]);
    expect(passage.lines[1].phrases).toEqual([
      {
        positions: [0, 1],
        text: "ਰਜਿ ਰਜਿ",
        padarth: [{ term: "ਰਜਿ ਰਜਿ", gloss: "ਰੱਜ ਰੱਜ ਕੇ, ਸੁਆਦ ਨਾਲ", notes: [], match: "exact", borrowedFromLineId: 46862 }],
        glosses: [],
      },
    ]);
  });

  it("keeps pad-arth that fits no line, and leading notes, on its own line", () => {
    const bhukhia = line(7, "ਭੁਖਿਆ ਭੁਖ ਨ ਉਤਰੀ ਜੇ ਬੰਨਾ ਪੁਰੀਆ ਭਾਰ ॥");
    const [l] = assemblePassage(
      input([bhukhia], {
        translations: [{ lineId: 7, sourceCode: "ss_padarth", body: "(1) ਪਹਿਲਾ ਨੋਟ। ਪੁਰੀ = ਲੋਕ, ਭਵਣ। ਪੁਰੀਆ ਭਾਰ = ਸਾਰੇ ਲੋਕਾਂ ਦੇ ਭਾਰ।" }],
      })
    ).lines;
    expect(l.padarthUnplaced).toEqual([{ term: "ਪੁਰੀ", gloss: "ਲੋਕ, ਭਵਣ", notes: [] }]);
    expect(l.padarthLeading).toEqual(["ਪਹਿਲਾ ਨੋਟ"]);
    expect(l.phrases.map((p) => p.text)).toEqual(["ਪੁਰੀਆ ਭਾਰ"]);
  });

  it("marks a gapped phrase in its text", () => {
    const kiv = line(9, "ਕਿਵ ਸਚਿਆਰਾ ਹੋਈਐ ਕਿਵ ਕੂੜੈ ਤੁਟੈ ਪਾਲਿ ॥");
    const [l] = assemblePassage(
      input([kiv], { translations: [{ lineId: 9, sourceCode: "ss_padarth", body: "ਕੂੜੈ ਪਾਲਿ = ਕੂੜ ਦੀ ਕੰਧ।" }] })
    ).lines;
    expect(l.phrases[0].text).toBe("ਕੂੜੈ … ਪਾਲਿ");
    expect(l.phrases[0].padarth[0].match).toBe("gapped");
  });

  it("matches multi-word dictionary headwords and merges them with pad-arth on the same words", () => {
    const otiPoti = line(70000, "ਓਤਿ ਪੋਤਿ ਮਿਲਿਓ ਭਗਤਨ ਕਉ ॥");
    const [l] = assemblePassage(
      input([otiPoti], {
        phraseDefinitions: [
          { headword: "ਓਤਿ ਪੋਤਿ", source: "shackle", senseNumber: 1, text: "warp and weft", textEn: null },
          { headword: "ਅਬੇ ਤਬੇ", source: "shackle", senseNumber: 1, text: "not here", textEn: null },
        ],
        translations: [{ lineId: 70000, sourceCode: "ss_padarth", body: "ਓਤਿ ਪੋਤਿ = ਤਾਣੇ ਪੇਟੇ ਵਾਂਗ।" }],
      })
    ).lines;
    expect(l.phrases).toHaveLength(1);
    expect(l.phrases[0].positions).toEqual([0, 1]);
    expect(l.phrases[0].padarth.map((p) => p.gloss)).toEqual(["ਤਾਣੇ ਪੇਟੇ ਵਾਂਗ"]);
    expect(l.phrases[0].glosses).toEqual([
      { source: "shackle", via: null, senses: [{ senseNumber: 1, text: "warp and weft", textEn: null }] },
    ]);
  });

  it("orders sources by dictSourceOrder, then any others as they appear", () => {
    const one = line(80000, "ਸਚੁ ॥");
    const [l] = assemblePassage(
      input([one], {
        definitions: [
          { wordId: wid("ਸਚੁ"), source: "sikhri", senseNumber: 1, text: "c", textEn: null },
          { wordId: wid("ਸਚੁ"), source: "shackle", senseNumber: 1, text: "b", textEn: null },
          { wordId: wid("ਸਚੁ"), source: "mahan_kosh", senseNumber: 1, text: "a", textEn: null },
        ],
      })
    ).lines;
    expect(l.words[0].glosses.map((g) => g.source)).toEqual(["mahan_kosh", "shackle", "sikhri"]);
    expect(l.padarthRaw).toBeNull();
  });
});
