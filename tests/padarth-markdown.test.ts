import { describe, it, expect } from "vitest";
import { assemblePassage } from "../lib/padarth/assemble";
import { passageToMarkdown } from "../lib/padarth/markdown";
import { tokenize } from "../lib/tokenizer";

// The Markdown is what gets copied out (to notes, or to an AI). Fixed fixture,
// full expected text: any change to the layout should show up here.

function occurrences(lineId: number, gurmukhi: string, ids: Record<string, number>) {
  return tokenize(gurmukhi).map((g, position) => ({ lineId, position, wordId: ids[g], gurmukhi: g }));
}

const IDS: Record<string, number> = {
  "ਮਃ": 1, "ਰਜਿ": 2, "ਭੋਜਨੁ": 3, "ਖਾਵਹੁ": 4, "ਮੇਰੇ": 5, "ਭਾਈ": 6, "ਭੋਜਨ": 7,
  "ਸੋਚੈ": 10, "ਸੋਚਿ": 11, "ਨ": 12, "ਹੋਵਈ": 13, "ਜੇ": 14, "ਸੋਚੀ": 15, "ਲਖ": 16, "ਵਾਰ": 17,
};

const HEADING = "ਮਃ ੫ ॥";
const VERSE = "ਰਜਿ ਰਜਿ ਭੋਜਨੁ ਖਾਵਹੁ ਮੇਰੇ ਭਾਈ ॥";
const SOCHAI = "ਸੋਚੈ ਸੋਚਿ ਨ ਹੋਵਈ ਜੇ ਸੋਚੀ ਲਖ ਵਾਰ ॥";

const passage = assemblePassage({
  lines: [
    { id: 1, ang: 1, lineNo: 5, gurmukhi: SOCHAI },
    { id: 2, ang: 1, lineNo: 6, gurmukhi: HEADING },
    { id: 3, ang: 1, lineNo: 6, gurmukhi: VERSE },
  ],
  occurrences: [...occurrences(1, SOCHAI, IDS), ...occurrences(2, HEADING, IDS), ...occurrences(3, VERSE, IDS)],
  definitions: [
    { wordId: 11, source: "mahan_kosh", senseNumber: 1, text: "ਸੋਚ ਕੇ", textEn: null },
    { wordId: 11, source: "mahan_kosh", senseNumber: 2, text: "ਸ਼ੁੱਧਤਾ", textEn: "purity" },
    { wordId: 7, source: "shackle", senseNumber: 1, text: "food", textEn: null },
  ],
  phraseDefinitions: [],
  baseForms: [{ wordId: 3, base: "ਭੋਜਨ", baseWordId: 7, basis: "Shackle cross-reference" }],
  grammar: [{ wordId: 11, pos: "noun", gender: "feminine", number: null, gramCase: null, sourceCode: "mahan_kosh" }],
  translations: [
    { lineId: 1, sourceCode: "manmohan_en", body: "By thinking, He cannot be thought of." },
    {
      lineId: 1,
      sourceCode: "ss_padarth",
      body: "ਸੋਚਿ = ਸੁਚਿ, ਪਵਿੱਤਰਤਾ। ਸ਼ਬਦ 'ਸੋਚਿ' ਇਸਤ੍ਰੀ-ਲਿੰਗ ਹੈ। ਨ ਹੋਵਈ = ਨਹੀਂ ਹੋ ਸਕਦੀ। ਪੁਰੀ = ਲੋਕ।",
    },
    { lineId: 2, sourceCode: "ss_padarth", body: "ਰਜਿ ਰਜਿ = ਰੱਜ ਰੱਜ ਕੇ" },
  ],
  dictSourceOrder: ["mahan_kosh", "shackle"],
  translationOrder: ["manmohan_en"],
});

const EXPECTED = `### ਸੋਚੈ ਸੋਚਿ ਨ ਹੋਵਈ ਜੇ ਸੋਚੀ ਲਖ ਵਾਰ ॥
Ang 1, line 5

- Manmohan Singh (English): By thinking, He cannot be thought of.

**ਸੋਚੈ** — no gloss found

**ਸੋਚਿ**
- Pad-arth: ਸੁਚਿ, ਪਵਿੱਤਰਤਾ
  - Note: ਸ਼ਬਦ 'ਸੋਚਿ' ਇਸਤ੍ਰੀ-ਲਿੰਗ ਹੈ
- Mahan Kosh: 1. ਸੋਚ ਕੇ; 2. ਸ਼ੁੱਧਤਾ (purity)
- Grammar (Mahan Kosh): noun, feminine

**ਨ** — in phrase ਨ ਹੋਵਈ

**ਹੋਵਈ** — in phrase ਨ ਹੋਵਈ

**ਨ ਹੋਵਈ** (phrase)
- Pad-arth: ਨਹੀਂ ਹੋ ਸਕਦੀ

**ਜੇ** — no gloss found

**ਸੋਚੀ** — no gloss found

**ਲਖ** — no gloss found

**ਵਾਰ** — no gloss found

Pad-arth not placed on a word:
- ਪੁਰੀ = ਲੋਕ

---

### ਮਃ ੫ ॥
Ang 1, line 6

**ਮਃ** — no gloss found

---

### ਰਜਿ ਰਜਿ ਭੋਜਨੁ ਖਾਵਹੁ ਮੇਰੇ ਭਾਈ ॥
Ang 1, line 6

**ਰਜਿ** — in phrase ਰਜਿ ਰਜਿ

**ਰਜਿ** — in phrase ਰਜਿ ਰਜਿ

**ਰਜਿ ਰਜਿ** (phrase)
- Pad-arth (filed under ਮਃ ੫ ॥): ਰੱਜ ਰੱਜ ਕੇ

**ਭੋਜਨੁ**
- Shackle, via ਭੋਜਨ (Shackle cross-reference): food

**ਖਾਵਹੁ** — no gloss found

**ਮੇਰੇ** — no gloss found

**ਭਾਈ** — no gloss found
`;

describe("passageToMarkdown", () => {
  it("renders lines, translations, words, phrases and leftovers", () => {
    expect(passageToMarkdown(passage)).toBe(EXPECTED);
  });

  it("lets the caller relabel sources", () => {
    const md = passageToMarkdown(passage, { mahan_kosh: "MK" });
    expect(md).toContain("- MK: 1. ਸੋਚ ਕੇ; 2. ਸ਼ੁੱਧਤਾ (purity)");
    expect(md).toContain("- Grammar (MK): noun, feminine");
  });

  it("shows a gapped phrase with its gap", () => {
    const md = passageToMarkdown(
      assemblePassage({
        lines: [{ id: 9, ang: 1, lineNo: 6, gurmukhi: "ਕਿਵ ਕੂੜੈ ਤੁਟੈ ਪਾਲਿ ॥" }],
        occurrences: tokenize("ਕਿਵ ਕੂੜੈ ਤੁਟੈ ਪਾਲਿ ॥").map((g, position) => ({ lineId: 9, position, wordId: 50 + position, gurmukhi: g })),
        definitions: [],
        phraseDefinitions: [],
        baseForms: [],
        grammar: [],
        translations: [{ lineId: 9, sourceCode: "ss_padarth", body: "ਕੂੜੈ ਪਾਲਿ = ਕੂੜ ਦੀ ਕੰਧ।" }],
        dictSourceOrder: [],
        translationOrder: [],
      })
    );
    expect(md).toContain("**ਕੂੜੈ … ਪਾਲਿ** (phrase)\n- Pad-arth: ਕੂੜ ਦੀ ਕੰਧ");
  });
});
