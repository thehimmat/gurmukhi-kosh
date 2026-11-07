import { describe, it, expect } from "vitest";
import { foldGurmukhi, foldSpelling } from "../lib/gurmukhi-fold";

const collide = (a: string, b: string) => expect(foldGurmukhi(a)).toBe(foldGurmukhi(b));
const differ = (a: string, b: string) => expect(foldGurmukhi(a)).not.toBe(foldGurmukhi(b));

describe("foldGurmukhi", () => {
  it("folds retroflex to dental so ਤ/ਟ and ਦ/ਡ families collide", () => {
    collide("ਤੀਕਾ", "ਟੀਕਾ");
    collide("ਦਰ", "ਡਰ");
    collide("ਥਾਲ", "ਠਾਲ");
    collide("ਧਾਲ", "ਢਾਲ");
    collide("ਨਾਮ", "ਣਾਮ");
  });

  it("folds nukta letters to their base (NFC and NFD inputs alike)", () => {
    collide("ਖ਼ਾਲਸਾ", "ਖਾਲਸਾ");
    collide("ਸ਼ਬਦ", "ਸਬਦ");
    collide("ਜ਼ਿਕਰ", "ਜਿਕਰ");
    collide("ਫ਼ੌਜ", "ਫੌਜ");
    // Composed U+0A59 vs decomposed ਖ + nukta fold identically.
    collide("ਖ਼ਰਾ", "ਖ਼ਰਾ".normalize("NFD"));
  });

  it("folds vowel length (dependent and independent)", () => {
    collide("ਗੁਰੂ", "ਗੁਰੁ");
    collide("ਮਿਲ", "ਮੀਲ");
    collide("ਸੇਖ", "ਸੈਖ");
    collide("ਇਕ", "ਈਕ");
    collide("ਉਪਰ", "ਊਪਰ");
  });

  it("drops one grammatical final short matra (ਸਭ/ਸਭੁ, ਦਰ/ਦਰਿ)", () => {
    collide("ਸਭ", "ਸਭੁ");
    collide("ਦਰ", "ਦਰਿ");
    // A trailing long matra folds to short first, then drops: ਗੁਰੂ → ਗੁਰ.
    expect(foldGurmukhi("ਗੁਰੂ")).toBe(foldGurmukhi("ਗੁਰ"));
    // Word-internal short matras are kept: ਸਤਿਗੁਰ folds to a key that still
    // begins with the folded ਸਤਿ (typing-prefix stability).
    expect(foldGurmukhi("ਸਤਿਗੁਰ").startsWith(foldGurmukhi("ਸਤਿ"))).toBe(true);
  });

  it("merges nasal signs and drops adhak/visarga", () => {
    collide("ਸੰਤ", "ਸਂਤ");
    collide("ਦੁਃਖ", "ਦੁਖ");
    collide("ਪੱਕਾ", "ਪਕਾ");
  });

  it("keeps genuinely contrastive distinctions apart", () => {
    differ("ਕਾਲ", "ਕਲ"); // kanna is not folded
    differ("ਘਰ", "ਗਰ"); // aspiration is not folded
    differ("ਪਰ", "ਪੁਰ"); // word-internal (non-final) aunkar is kept
  });

  it("ignores non-Gurmukhi input rather than poisoning the key", () => {
    expect(foldGurmukhi("abc123!")).toBe("");
    expect(foldGurmukhi("ਸਤਿ.")).toBe(foldGurmukhi("ਸਤਿ"));
  });
});

// The stricter key for the pad-arth's spelling-variant tier (#377): the same word spelled
// differently, never a different grammatical ending.
describe("foldSpelling", () => {
  it("folds consonant spellings, nasal signs and nukta", () => {
    expect(foldSpelling("ਨੀਸਾਣੁ")).toBe(foldSpelling("ਨੀਸਾਨੁ"));
    expect(foldSpelling("ਵਿਣੁ")).toBe(foldSpelling("ਵਿਨੁ"));
    expect(foldSpelling("ਸਾਂਤਿ")).toBe(foldSpelling("ਸਾੰਤਿ"));
    expect(foldSpelling("ਖ਼ਸਮ")).toBe(foldSpelling("ਖਸਮ"));
  });

  it("keeps vowel length and the final short matra, which carry grammar", () => {
    expect(foldSpelling("ਗੁਣ")).not.toBe(foldSpelling("ਗੁਣੁ"));
    expect(foldSpelling("ਸਭ")).not.toBe(foldSpelling("ਸਭੁ"));
    expect(foldSpelling("ਕਰੀ")).not.toBe(foldSpelling("ਕਰਿ"));
  });

  it("is never looser than the search fold", () => {
    for (const [a, b] of [["ਨੀਸਾਣੁ", "ਨੀਸਾਨੁ"], ["ਵਿਣੁ", "ਵਿਨੁ"]]) {
      expect(foldGurmukhi(a)).toBe(foldGurmukhi(b));
    }
  });
});
