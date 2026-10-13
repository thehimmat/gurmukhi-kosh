import { describe, it, expect } from "vitest";
import { parsePadarth } from "../lib/padarth/parse";
import { tokenize } from "../lib/tokenizer";

// Bodies and lines are verbatim from the written rows (padarth_glosses, #175),
// with lines.id noted. These cover the one case a text-only rule cannot decide
// (#181): the BaniDB `pss` text writes `=` both as a compound hyphen and as an
// entry separator (its digitisation, not Sahib Singh's print; see parse.ts), so "ਮਿਹਨਤ, ਘਾਲ = ਕਮਾਈ" and "ਗਲ ਵਿਚ, ਲਾਇ = ਲਾ ਕੇ" are the same
// shape. Only the line's own words separate them, so the split is gated on
// lineTokens and does nothing without them.

const terms = (body: string, line?: string) =>
  parsePadarth(body, line ? { lineTokens: tokenize(line) } : {}).entries.map((e) => e.term);

describe("parsePadarth with lineTokens", () => {
  it("recovers an entry swallowed after a comma (line 1113)", () => {
    const body = "ਕੰਠਿ = ਗਲ ਵਿਚ, ਲਾਇ = ਲਾ ਕੇ";
    const line = "ਹਰਿ ਹਾਰੁ ਕੰਠਿ ਜਿਨੀ ਪਹਿਰਿਆ ਗੁਰ ਚਰਣੀ ਚਿਤੁ ਲਾਇ ॥";
    expect(terms(body, line)).toEqual(["ਕੰਠਿ", "ਲਾਇ"]);
    const out = parsePadarth(body, { lineTokens: tokenize(line) });
    expect(out.entries[0].gloss).toBe("ਗਲ ਵਿਚ");
    expect(out.entries[1].gloss).toBe("ਲਾ ਕੇ");
  });

  it("recovers one after several comma-separated senses (line 6137)", () => {
    const body = "ਸੇਵਨਿ = ਸੇਂਵਦੇ ਹਨ, ਹੁਕਮ ਵਿਚ ਤੁਰਦੇ ਹਨ, ਮਾਰਗੁ = ਰਸਤਾ";
    const line = "ਸਚਾ ਸਤਿਗੁਰੁ ਸੇਵਨਿ ਸਚਾ ਮਾਰਗੁ ਦਸਿਆ ॥";
    expect(terms(body, line)).toEqual(["ਸੇਵਨਿ", "ਮਾਰਗੁ"]);
  });

  it("recovers one after a closed brace (line 22286)", () => {
    const body = "ਜੀਤਿ ਜੀਤਿ ਜੀਤੇ = ਸਦਾ ਤੋਂ ਜਿੱਤਦੀ ਆ ਰਹੀ ਹੈ {ਵੇਖੋ 'ਗੁਰਬਾਣੀ ਵਿਆਕਰਣ'} ਸਭਿ = ਸਾਰੇ";
    const line = "ਜੀਤਿ ਜੀਤਿ ਜੀਤੇ ਸਭਿ ਥਾਨਾ ਸਗਲ ਭਵਨ ਲਪਟਹੀ ॥";
    expect(terms(body, line)).toContain("ਸਭਿ");
  });

  // The regression that matters. These are single glosses, not two entries.
  it("leaves a compound joined with = alone: ਘਾਲ = ਕਮਾਈ (line 385)", () => {
    const body = "ਮਸਕਤਿ = ਮਸ਼ੱਕਤਿ, ਮਿਹਨਤ, ਘਾਲ = ਕਮਾਈ";
    const line = "ਨਾਨਕ ਤੇ ਮੁਖ ਉਜਲੇ ਕੇਤੀ ਛੁਟੀ ਨਾਲਿ ॥੧॥";
    expect(terms(body, line)).toEqual(["ਮਸਕਤਿ"]);
    expect(parsePadarth(body, { lineTokens: tokenize(line) }).entries[0].gloss).toBe(
      "ਮਸ਼ੱਕਤਿ, ਮਿਹਨਤ, ਘਾਲ = ਕਮਾਈ",
    );
  });

  it("leaves ਰਾਜ = ਦਰਬਾਰ alone (line 246)", () => {
    const body = "ਦੀਬਾਣੁ = ਕਚਹਿਰੀ, ਰਾਜ = ਦਰਬਾਰ";
    const line = "ਅਮੁਲੁ ਧਰਮੁ ਅਮੁਲੁ ਦੀਬਾਣੁ ॥";
    expect(terms(body, line)).toEqual(["ਦੀਬਾਣੁ"]);
  });

  // Guard: metalanguage inside an unclosed brace. ਕਿਨ IS a word of the line,
  // so the token gate alone would split here and invent an entry whose gloss
  // says "these words are plural".
  it("ignores a candidate inside an unclosed brace (line 7273)", () => {
    const body = "ਕਿਨ = {ਨੋਟ: ਜਿਨ, ਤਿਨ, ਇਨ, ਕਿਨ = ਇਹ ਲਫ਼ਜ਼ ਬਹੁ-ਵਚਨ ਹਨ";
    const line = "ਕਿਨ ਬਿਧਿ ਕੁਸਲੁ ਹੋਤ ਮੇਰੇ ਭਾਈ ॥";
    expect(terms(body, line)).toEqual(["ਕਿਨ"]);
  });

  // Guard: the entry repeating its own term after an etymology aside.
  it("does not split on a repeat of the entry's own term (line 294)", () => {
    const body = "ਅਨਾਹਤਿ = (ਅਨ-ਆਹਤਿ) , ਆਹਤਿ-ਨਾਸ, ਖੈ, ਅਨਾਹਤਿ = ਨਾਸ ਰਹਿਤ, ਇਕ-ਰਸ";
    const line = "ਆਦਿ ਅਨੀਲੁ ਅਨਾਦਿ ਅਨਾਹਤਿ ਜੁਗੁ ਜੁਗੁ ਏਕੋ ਵੇਸੁ ॥੨੮॥";
    expect(terms(body, line)).toEqual(["ਅਨਾਹਤਿ"]);
  });

  it("is inert without lineTokens, for every case above", () => {
    expect(terms("ਕੰਠਿ = ਗਲ ਵਿਚ, ਲਾਇ = ਲਾ ਕੇ")).toEqual(["ਕੰਠਿ"]);
    expect(terms("ਸੇਵਨਿ = ਸੇਂਵਦੇ ਹਨ, ਹੁਕਮ ਵਿਚ ਤੁਰਦੇ ਹਨ, ਮਾਰਗੁ = ਰਸਤਾ")).toEqual(["ਸੇਵਨਿ"]);
    expect(terms("ਮਸਕਤਿ = ਮਸ਼ੱਕਤਿ, ਮਿਹਨਤ, ਘਾਲ = ਕਮਾਈ")).toEqual(["ਮਸਕਤਿ"]);
  });

  it("does not split onto a word the line does not have", () => {
    // ਸਭੁ ਕੋ is glossed on line 196's row but belongs to another line, so it
    // stays inside the gloss rather than becoming a bogus entry here.
    const body = "ਵਰਨੀ = ਮੈਂ ਵਰਣਨ ਕਰਾਂ, ਸਭੁ ਕੋ = ਹਰੇਕ ਜੀਵ";
    const line = "ਕਿਵ ਕਰਿ ਆਖਾ ਕਿਵ ਸਾਲਾਹੀ ਕਿਉ ਵਰਨੀ ਕਿਵ ਜਾਣਾ ॥";
    expect(terms(body, line)).toEqual(["ਵਰਨੀ"]);
  });
});
