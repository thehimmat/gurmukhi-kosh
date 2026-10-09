import { describe, it, expect } from "vitest";
import { parsePadarth } from "../lib/padarth/parse";

// Golden cases use VERBATIM pad-arth bodies from line_translations
// (source_code='ss_padarth'); the line id each came from is noted. The parser
// splits a body into `term = gloss` entries and keeps everything else as notes,
// so nothing Sahib Singh wrote is dropped.

const terms = (body: string) => parsePadarth(body).entries.map((e) => e.term);
const entry = (body: string, term: string, nth = 0) =>
  parsePadarth(body).entries.filter((e) => e.term === term)[nth];

describe("parsePadarth", () => {
  it("reads a single phrase entry (line 29)", () => {
    const { entries, leading } = parsePadarth("ਹਾਦਰਾ ਹਦੂਰਿ = ਹਾਜ਼ਰ ਨਾਜ਼ਰ, ਸਭ ਥਾਈਂ ਹਾਜ਼ਰ।");
    expect(entries).toEqual([{ term: "ਹਾਦਰਾ ਹਦੂਰਿ", gloss: "ਹਾਜ਼ਰ ਨਾਜ਼ਰ, ਸਭ ਥਾਈਂ ਹਾਜ਼ਰ", notes: [] }]);
    expect(leading).toEqual([]);
  });

  it("splits several entries at the danda, in order (line 5)", () => {
    const body =
      "ਸੋਚੈ = ਸੁਚਿ ਰੱਖਣ ਨਾਲ, ਪਵਿੱਤਰਤਾ ਕਾਇਮ ਰੱਖਣ ਨਾਲ। ਸੋਚਿ = ਸੁਚਿ, ਪਵਿੱਤਰਤਾ, ਸੁੱਚ। ਨ ਹੋਵਈ = ਨਹੀਂ ਹੋ ਸਕਦੀ। ਸੋਚੀ = ਮੈਂ ਸੁੱਚ ਰੱਖਾਂ।";
    expect(terms(body)).toEqual(["ਸੋਚੈ", "ਸੋਚਿ", "ਨ ਹੋਵਈ", "ਸੋਚੀ"]);
    expect(entry(body, "ਨ ਹੋਵਈ").gloss).toBe("ਨਹੀਂ ਹੋ ਸਕਦੀ");
  });

  it("attaches sentences without a separator to the entry before them (line 3)", () => {
    const body =
      "ਆਦਿ = ਮੁੱਢ ਤੋਂ। ਸਚੁ = ਹੋਂਦ ਵਾਲਾ। ਸ਼ਬਦ 'ਸਚੁ' ਸੰਸਕ੍ਰਿਤ ਦੇ 'ਸਤਯ' ਦਾ ਪ੍ਰਾਕ੍ਰਿਤ ਹੈ, ਜਿਸ ਦਾ ਧਾਤੂ 'ਅਸ' ਹੈ। 'ਅਸ' ਦਾ ਅਰਥ ਹੈ 'ਹੋਣਾ'। ਜੁਗਾਦਿ = ਜੁਗਾਂ ਦੇ ਮੁੱਢ ਤੋਂ।";
    expect(terms(body)).toEqual(["ਆਦਿ", "ਸਚੁ", "ਜੁਗਾਦਿ"]);
    expect(entry(body, "ਸਚੁ").notes).toEqual([
      "ਸ਼ਬਦ 'ਸਚੁ' ਸੰਸਕ੍ਰਿਤ ਦੇ 'ਸਤਯ' ਦਾ ਪ੍ਰਾਕ੍ਰਿਤ ਹੈ, ਜਿਸ ਦਾ ਧਾਤੂ 'ਅਸ' ਹੈ",
      "'ਅਸ' ਦਾ ਅਰਥ ਹੈ 'ਹੋਣਾ'",
    ]);
  });

  it("splits only at the first = in a sentence (line 6)", () => {
    const body = "ਲਾਇ ਰਹਾ = ਮੈਂ ਲਾਈ ਰੱਖਾਂ। ਲਿਵ ਤਾਰ = ਲਿਵ ਦੀ ਤਾਰ, ਲਿਵ ਦੀ ਡੋਰ, ਇਕ = ਤਾਰ ਸਮਾਧੀ।";
    expect(terms(body)).toEqual(["ਲਾਇ ਰਹਾ", "ਲਿਵ ਤਾਰ"]);
    expect(entry(body, "ਲਿਵ ਤਾਰ").gloss).toBe("ਲਿਵ ਦੀ ਤਾਰ, ਲਿਵ ਦੀ ਡੋਰ, ਇਕ = ਤਾਰ ਸਮਾਧੀ");
  });

  it("accepts an en dash as the separator and drops bare verse numbers (line 4)", () => {
    const body = "ਹੈ– ਭਾਵ, ਇਸ ਵੇਲੇ ਭੀ ਹੈ। ਨਾਨਕ = ਹੇ ਨਾਨਕ! ਹੋਸੀ = ਹੋਵੇਗਾ, ਰਹੇਗਾ। 1।";
    const { entries, leading } = parsePadarth(body);
    expect(entries.map((e) => e.term)).toEqual(["ਹੈ", "ਨਾਨਕ", "ਹੋਸੀ"]);
    expect(entry(body, "ਹੈ").gloss).toBe("ਭਾਵ, ਇਸ ਵੇਲੇ ਭੀ ਹੈ");
    expect(entry(body, "ਨਾਨਕ").gloss).toBe("ਹੇ ਨਾਨਕ!");
    expect(entries.every((e) => e.notes.length === 0)).toBe(true);
    expect(leading).toEqual([]);
  });

  it("reads hyphen-separated rows that have no = at all (line 139)", () => {
    const body =
      "ਸੂਰ-ਸੂਰਮੇ, ਜੋਧੇ। ਮੁਹ-ਮੂੰਹਾਂ ਉੱਤੇ। ਭਖਸਾਰ-ਸਾਰ ਭਖਣ ਵਾਲੇ, ਲੋਹਾ ਖਾਣ ਵਾਲੇ, ਸ਼ਾਸਤ੍ਰਾਂ ਦੇ ਵਾਰ ਸਹਿਣ ਵਾਲੇ। ਮੋਨਿ-ਚੁੱਪ ਰਹਿਣ ਵਾਲੇ। ਲਿਵ ਲਾਇ ਤਾਰ-ਲਿਵ ਦੀ ਤਾਰ ਲਾ ਕੇ, ਇਕ-ਰਸ ਲਿਵ ਲਾ ਕੇ, ਇਕ-ਰਸ ਬ੍ਰਿਤੀ ਜੋੜ ਕੇ।";
    expect(terms(body)).toEqual(["ਸੂਰ", "ਮੁਹ", "ਭਖਸਾਰ", "ਮੋਨਿ", "ਲਿਵ ਲਾਇ ਤਾਰ"]);
    expect(entry(body, "ਲਿਵ ਲਾਇ ਤਾਰ").gloss).toBe("ਲਿਵ ਦੀ ਤਾਰ ਲਾ ਕੇ, ਇਕ-ਰਸ ਲਿਵ ਲਾ ਕੇ, ਇਕ-ਰਸ ਬ੍ਰਿਤੀ ਜੋੜ ਕੇ");
  });

  it("reads hyphen entries in a row that also uses = (line 4988)", () => {
    const body =
      "ਸਾਚੀ = ਸਦਾ ਕਾਇਮ ਰਹਿਣ ਵਾਲੀ। ਨਾਈ = {Ônw = ਅਰਬੀ ਲ਼ਫ਼ਜ਼} ਵਡਿਆਈ। ਕਿਸੈ-ਕਿਸੇ ਵਿਰਲੇ ਨੂੰ। ਸਬਦਿ-ਸ਼ਬਦ ਦੀ ਰਾਹੀਂ। ਸਹਜੇ-ਸਹਜਿ, ਆਤਮਕ ਅਡੋਲਤਾ ਵਿਚ। 2। ਕਾਮਣਿ-ਇਸਤ੍ਰੀ {kwimnI}।";
    expect(terms(body)).toEqual(["ਸਾਚੀ", "ਨਾਈ", "ਕਿਸੈ", "ਸਬਦਿ", "ਸਹਜੇ", "ਕਾਮਣਿ"]);
    expect(entry(body, "ਨਾਈ").gloss).toBe("{Ônw = ਅਰਬੀ ਲ਼ਫ਼ਜ਼} ਵਡਿਆਈ");
  });

  it("collapses line breaks inside terms and glosses (line 23931)", () => {
    const body =
      "ਅਤਿ ਪ੍ਰੀਤਮ = ਬਹੁਤ \nਪਿਆਰਾ ਲੱਗਣ ਵਾਲਾ। ਮੋਹਨਾ = ਮੋਹ ਲੈਣ ਵਾਲਾ। ਘਟ \nਸੋਹਨਾ = ਹਰੇਕ ਘਟ ਵਿਚ ਸੋਭ ਰਿਹਾ। ਪ੍ਰਾਨ ਅਧਾਰਾ = ਜਿੰਦ ਦਾ ਆਸਰਾ।";
    expect(terms(body)).toEqual(["ਅਤਿ ਪ੍ਰੀਤਮ", "ਮੋਹਨਾ", "ਘਟ ਸੋਹਨਾ", "ਪ੍ਰਾਨ ਅਧਾਰਾ"]);
    expect(entry(body, "ਅਤਿ ਪ੍ਰੀਤਮ").gloss).toBe("ਬਹੁਤ ਪਿਆਰਾ ਲੱਗਣ ਵਾਲਾ");
  });

  it("keeps a note whose = follows prose as a note (line 29913)", () => {
    const body =
      "ਕਪਾਲੁ = ਖੋਪਰੀ। ਨੋਟ: ਪੁਰਾਣਕ ਕਥਾ = ਅਨੁਸਾਰ ਬ੍ਰਹਮਾ ਆਪਣੀ ਲੜਕੀ ਸਰਸ੍ਵਤੀ ਉਤੇ \nਮੋਹਿਤ ਹੋ ਗਿਆ। ੩।";
    expect(terms(body)).toEqual(["ਕਪਾਲੁ"]);
    expect(entry(body, "ਕਪਾਲੁ").notes).toEqual([
      "ਨੋਟ: ਪੁਰਾਣਕ ਕਥਾ = ਅਨੁਸਾਰ ਬ੍ਰਹਮਾ ਆਪਣੀ ਲੜਕੀ ਸਰਸ੍ਵਤੀ ਉਤੇ ਮੋਹਿਤ ਹੋ ਗਿਆ",
    ]);
  });

  it("does not split at a hyphen inside prose (line 2402)", () => {
    const body =
      "ਭੈ ਕਾ ਬੋਹਿਥਾ = ਡਰਾਂ ਤੋਂ ਬਚਾਣ ਵਾਲਾ ਜਹਾਜ਼। {ਨੋਟ: ਲਫ਼ਜ਼ 'ਪਾਰੁ' ਅਤੇ 'ਪਾਰਿ' ਦਾ ਫ਼ਰਕ ਚੇਤੇ ਰੱਖਣ-ਯੋਗ ਹੈ। ਪਾਰੁ = ਪਾਰਲਾ ਪਾਸਾ (ਨਾਂਵ) । ਪਾਰਿ = ਪਾਰਲੇ ਪਾਸੇ (ਕ੍ਰਿਆ ਵਿਸ਼ੇਸ਼ਣ) }। 4।";
    expect(terms(body)).toEqual(["ਭੈ ਕਾ ਬੋਹਿਥਾ", "ਪਾਰੁ", "ਪਾਰਿ"]);
    expect(entry(body, "ਭੈ ਕਾ ਬੋਹਿਥਾ").notes).toEqual([
      "{ਨੋਟ: ਲਫ਼ਜ਼ 'ਪਾਰੁ' ਅਤੇ 'ਪਾਰਿ' ਦਾ ਫ਼ਰਕ ਚੇਤੇ ਰੱਖਣ-ਯੋਗ ਹੈ",
    ]);
    // the closing brace of the note is not part of the gloss
    expect(entry(body, "ਪਾਰਿ").gloss).toBe("ਪਾਰਲੇ ਪਾਸੇ (ਕ੍ਰਿਆ ਵਿਸ਼ੇਸ਼ਣ)");
  });

  it("keeps a danda inside parentheses within the gloss (line 54261)", () => {
    const body =
      "ਪ੍ਰੀਤਮ = ਹੇ ਪ੍ਰੀਤਮ! ਅੰਤਰੁ = ਵਿੱਥ (ਨਾਂਵ, ਇਕ-ਵਚਨ। ਲਫ਼ਜ਼ 'ਅੰਤਰੁ' ਅਤੇ 'ਅੰਤਰਿ' ਦਾ ਫ਼ਰਕ ਚੇਤੇ ਰੱਖਣ-ਜੋਗ ਹੈ) ।";
    expect(terms(body)).toEqual(["ਪ੍ਰੀਤਮ", "ਅੰਤਰੁ"]);
    expect(entry(body, "ਅੰਤਰੁ").gloss).toBe(
      "ਵਿੱਥ (ਨਾਂਵ, ਇਕ-ਵਚਨ। ਲਫ਼ਜ਼ 'ਅੰਤਰੁ' ਅਤੇ 'ਅੰਤਰਿ' ਦਾ ਫ਼ਰਕ ਚੇਤੇ ਰੱਖਣ-ਜੋਗ ਹੈ)"
    );
  });

  it("keeps a gloss that runs into a parenthesis (line 22)", () => {
    const body = "ਦੇਹ = ਸਰੀਰ। ਦੇਹਿ = ਦੇਹ(ਹੁਕਮੀ ਭਵਿਖਤ ਕਾਲ) ।";
    expect(entry(body, "ਦੇਹਿ").gloss).toBe("ਦੇਹ(ਹੁਕਮੀ ਭਵਿਖਤ ਕਾਲ)");
  });

  it("survives numbered asides and unclosed parentheses (line 26)", () => {
    const body =
      "ਕਥਿ = ਆਖ ਕੇ। ਕਥਿ ਕਥਿ ਕਥੀ = ਆਖ ਆਖ ਕੇ ਆਖੀ ਹੈ, ਕਥਨਾ ਕਥ ਕਥ ਕੇ ਕਥੀ ਹੈ, ਬੇਅੰਤ ਵਾਰੀ ਪ੍ਰਭੂ ਦੇ ਹੁਕਮ ਦਾ ਵਰਣਨ ਕੀਤਾ ਹੈ। ਕੋਟਿ = ਕ੍ਰੋੜ, ਕ੍ਰੋੜਾਂ ਜੀਵਾਂ ਨੇ। (1)  ਕੋਟਿ = ਕ੍ਰੋੜ (ਵਿਸ਼ੇਸ਼ਣ) । ਕੋਟਿ ਕਰਮ ਕਰੈ ਹਉ ਧਾਰੇ। ਸ੍ਰਮੁ ਪਾਵੈ ਸਗਲੇ ਬਿਰਥਾਰੇ। 3। 12। (ਸੁਖਮਨੀਕੋਟਿ ਖਤੇ ਖਿਨ ਬਖਸਨਹਾਰ। 3। 30। (ਭੈਰਉ ਮ: 5 (2)  ਕੋਟੁ = ਕਿਲ੍ਹਾ (ਨਾਂਵ ਇਕ-ਵਚਨ) । ਲੰਕਾ ਸਾ ਕੋਟੁ ਸਮੁੰਦ ਸੀ ਖਾਈ। (ਆਸਾ ਕਬੀਰ ਜੀਏਕੁ ਕੋਟਿ ਪੰਚ ਸਿਕਦਾਰਾ    (ਸੂਹੀ ਕਬੀਰ ਜੀ (3)  ਕੋਟ = ਕਿਲ੍ਹੇ (ਨਾਂਵ, ਬਹੁ ਵਚਨ) । ਕੰਚਨ ਕੇ ਕੋਟ ਦਤੁ ਕਰੀ ਬਹੁ ਹੈਵਰ ਗੈਵਰ ਦਾਨੁ। (ਸਿਰੀ ਰਾਗ ਮ: 1";
    expect(terms(body)).toEqual(["ਕਥਿ", "ਕਥਿ ਕਥਿ ਕਥੀ", "ਕੋਟਿ", "ਕੋਟਿ", "ਕੋਟੁ", "ਕੋਟ"]);
    expect(entry(body, "ਕੋਟਿ", 1).gloss).toBe("ਕ੍ਰੋੜ (ਵਿਸ਼ੇਸ਼ਣ)");
    expect(entry(body, "ਕੋਟੁ").gloss).toBe("ਕਿਲ੍ਹਾ (ਨਾਂਵ ਇਕ-ਵਚਨ)");
    expect(entry(body, "ਕੋਟ").gloss).toBe("ਕਿਲ੍ਹੇ (ਨਾਂਵ, ਬਹੁ ਵਚਨ)");
    // quotations stay as notes on the entry they follow, never as entries
    expect(entry(body, "ਕੋਟਿ", 1).notes).toContain("ਕੋਟਿ ਕਰਮ ਕਰੈ ਹਉ ਧਾਰੇ");
    expect(entry(body, "ਕੋਟੁ").notes).toContain("ਲੰਕਾ ਸਾ ਕੋਟੁ ਸਮੁੰਦ ਸੀ ਖਾਈ");
  });

  it("keeps notes before the first entry as leading text (line 178)", () => {
    const body =
      "(1)  ਪੁੰਨੀ ਪਾਪੀ ਆਖਣੁ ਨਾਹਿ। (ਪਉੜੀ 20 ਆਖਣੁ-ਨਾਮੁ, ਬਚਨ। ਨਾਹਿ-ਨਹੀਂ ਹੈ। ਕਰਿ ਕਰਿ ਕਰਣਾ-(ਆਪੋ ਆਪਣੇ) ਕਰਮ ਕਰ ਕੇ, ਜਿਹੋ ਜਿਹੇ ਕਰਮ ਕਰੋਗੇ। ਹੁਕਮੀ-ਅਕਾਲ ਪੁਰਖ ਦੇ ਹੁਕਮ ਵਿਚ।";
    const { entries, leading } = parsePadarth(body);
    expect(leading).toEqual(["ਪੁੰਨੀ ਪਾਪੀ ਆਖਣੁ ਨਾਹਿ", "(ਪਉੜੀ 20 ਆਖਣੁ-ਨਾਮੁ, ਬਚਨ"]);
    expect(entries.map((e) => e.term)).toEqual(["ਨਾਹਿ", "ਕਰਿ ਕਰਿ ਕਰਣਾ", "ਹੁਕਮੀ"]);
    expect(entries[1].gloss).toBe("(ਆਪੋ ਆਪਣੇ) ਕਰਮ ਕਰ ਕੇ, ਜਿਹੋ ਜਿਹੇ ਕਰਮ ਕਰੋਗੇ");
  });

  it("splits entries separated by ; but keeps ; between senses (verses 185, 110 in #165)", () => {
    const body =
      "ਅੰਤਰਗਤਿ = ਅੰਦਰਲਾ; ਤੀਰਥਿ = ਤੀਰਥ ਉੱਤੇ; ਅੰਤਰਗਤਿ ਤੀਰਥਿ = ਅੰਦਰਲੇ ਤੀਰਥ ਉੱਤੇ; ਮਲਿ = ਮਲ ਮਲ ਕੇ, ਚੰਗੀ ਤਰ੍ਹਾਂ; ਨਾਉ = ਇਸ਼ਨਾਨ (ਕੀਤਾ ਹੈ)";
    expect(terms(body)).toEqual(["ਅੰਤਰਗਤਿ", "ਤੀਰਥਿ", "ਅੰਤਰਗਤਿ ਤੀਰਥਿ", "ਮਲਿ", "ਨਾਉ"]);
    expect(entry(body, "ਤੀਰਥਿ").gloss).toBe("ਤੀਰਥ ਉੱਤੇ");
    expect(entry("ਮਾਨੁ = ਆਦਰ; ਵਡਿਆਈ।", "ਮਾਨੁ").gloss).toBe("ਆਦਰ; ਵਡਿਆਈ");
  });

  it("returns nothing for an empty body", () => {
    expect(parsePadarth("")).toEqual({ entries: [], leading: [] });
    expect(parsePadarth("  ।  ")).toEqual({ entries: [], leading: [] });
  });
});
