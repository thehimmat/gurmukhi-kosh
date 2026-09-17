import { describe, it, expect } from "vitest";
import {
  extractNumerals,
  isNumericQuery,
  parseGurmukhiNumber,
  toGurmukhiNumber,
  normalizeNumericQuery,
  NUMERAL_ROLES,
  DEFAULT_NUMERAL_ROLES,
  NUMERAL_ROLE_LABELS,
  type NumeralRole,
} from "../lib/gurmukhi-numerals";

// Role of the numeral with the given value in a line, for the common case of
// one occurrence of that value.
function roleOf(line: string, value: number): NumeralRole | undefined {
  return extractNumerals(line).find((n) => n.value === value)?.role;
}

describe("parseGurmukhiNumber / toGurmukhiNumber", () => {
  it("reads Gurmukhi digits as integers", () => {
    expect(parseGurmukhiNumber("੧")).toBe(1);
    expect(parseGurmukhiNumber("੦")).toBe(0);
    expect(parseGurmukhiNumber("੧੦")).toBe(10);
    expect(parseGurmukhiNumber("੧੭੯")).toBe(179);
    expect(parseGurmukhiNumber("੨੫੨੩")).toBe(2523);
  });

  it("reads ASCII digits too, so a Latin keyboard can search numbers", () => {
    expect(parseGurmukhiNumber("1")).toBe(1);
    expect(parseGurmukhiNumber("179")).toBe(179);
  });

  it("returns null for anything that is not a pure digit run", () => {
    expect(parseGurmukhiNumber("")).toBeNull();
    expect(parseGurmukhiNumber("ਮਹਲਾ")).toBeNull();
    expect(parseGurmukhiNumber("੧॥")).toBeNull();
    expect(parseGurmukhiNumber("ਮਹਲਾ ੧")).toBeNull();
  });

  it("renders integers back as Gurmukhi digits", () => {
    expect(toGurmukhiNumber(1)).toBe("੧");
    expect(toGurmukhiNumber(10)).toBe("੧੦");
    expect(toGurmukhiNumber(179)).toBe("੧੭੯");
  });

  it("round-trips", () => {
    for (const n of [0, 1, 5, 10, 42, 179, 2523]) {
      expect(parseGurmukhiNumber(toGurmukhiNumber(n))).toBe(n);
    }
  });
});

describe("isNumericQuery / normalizeNumericQuery", () => {
  it("is true only when the query is all digits", () => {
    expect(isNumericQuery("੧")).toBe(true);
    expect(isNumericQuery("੧੦")).toBe(true);
    expect(isNumericQuery("10")).toBe(true);
    expect(isNumericQuery("  ੫  ")).toBe(true);
  });

  it("is false for words, empty input, and digits mixed with letters", () => {
    expect(isNumericQuery("")).toBe(false);
    expect(isNumericQuery("   ")).toBe(false);
    expect(isNumericQuery("ਮਹਲਾ")).toBe(false);
    expect(isNumericQuery("ਮਹਲਾ ੧")).toBe(false);
    expect(isNumericQuery("੧॥")).toBe(false);
  });

  it("normalizes either script to the same integer", () => {
    expect(normalizeNumericQuery("੧੦")).toBe(10);
    expect(normalizeNumericQuery("10")).toBe(10);
    expect(normalizeNumericQuery("ਮਹਲਾ")).toBeNull();
  });
});

describe("extractNumerals — verse/pauri markers", () => {
  it("classifies a danda-wrapped tally as a verse marker", () => {
    expect(roleOf("ਜੇਹਾ ਬੀਉ ਤੇਹਾ ਫਲੁ ਪਾਇਆ ॥੧॥", 1)).toBe("verse_marker");
  });

  it("classifies every number in a chained tally as a verse marker", () => {
    const line = "ਤਿਨ ਕੀ ਪੰਕ ਹੋਵੈ ਜੇ ਨਾਨਕੁ ਤਉ ਮੂੜਾ ਕਿਛੁ ਪਾਈ ਰੇ ॥੪॥੪॥੧੬॥";
    const found = extractNumerals(line);
    expect(found.map((n) => n.value)).toEqual([4, 4, 16]);
    expect(found.every((n) => n.role === "verse_marker")).toBe(true);
  });

  it("treats the ਰਹਾਉ marker as a verse marker", () => {
    expect(roleOf("ਡਰਿ ਡਰਿ ਡਰਣਾ ਮਨ ਕਾ ਸੋਰੁ ॥੧॥ ਰਹਾਉ ॥", 1)).toBe("verse_marker");
  });

  it("treats a single danda (Bhai Gurdas) before the number the same way", () => {
    expect(roleOf("ਕੋਈ ਤੁਕ ਇਥੇ ।੨।", 2)).toBe("verse_marker");
  });

  it("marks a tally glued to the previous word without a space", () => {
    expect(roleOf("ਕਹੂੰ ਜੋਗ ਭੇਸ ਹੈਂ॥੧੭੯", 179)).toBe("verse_marker");
  });
});

describe("extractNumerals — author numbers (ਮਹਲਾ / ਮਃ / ਪਾਤਿਸਾਹੀ)", () => {
  it("classifies the number after ਮਹਲਾ", () => {
    expect(roleOf("ਆਸਾ ਮਹਲਾ ੫ ॥", 5)).toBe("author");
    expect(roleOf("ਸੋ ਦਰੁ ਰਾਗੁ ਆਸਾ ਮਹਲਾ ੧", 1)).toBe("author");
  });

  it("classifies the number after the ਮਃ abbreviation", () => {
    expect(roleOf("ਮਃ ੩ ॥", 3)).toBe("author");
    expect(roleOf("ਸਲੋਕੁ ਮਃ ੧ ॥", 1)).toBe("author");
  });

  it("classifies the number after ਪਾਤਿਸਾਹੀ, even with the danda glued on", () => {
    expect(roleOf("ਸ੍ਰੀ ਮੁਖਵਾਕ ਪਾਤਿਸਾਹੀ ੧੦॥", 10)).toBe("author");
  });

  it("reaches back past an intervening word (ਮਹਲਾ ਪਹਿਲਾ ੧)", () => {
    expect(roleOf("ਰਾਗੁ ਸਿਰੀਰਾਗੁ ਮਹਲਾ ਪਹਿਲਾ ੧ ॥", 1)).toBe("author");
  });

  it("accepts the spelling variants the corpus actually uses", () => {
    // Counted over the corpus: ਮਹਲੇ, ਮਹਲੁ, and the nukta ਸ਼ spellings of
    // ਪਾਤਿਸਾਹੀ all occur as the keyword before a heading number.
    expect(roleOf("ਸਵਈਏ ਮਹਲੇ ਚਉਥੇ ਕੇ ੪", 4)).toBe("author");
    expect(roleOf("ਸ੍ਰੀ ਮੁਖਵਾਕ ਪਾਤਸ਼ਾਹੀ ੧੦ ॥", 10)).toBe("author");
    expect(roleOf("ਸ੍ਰੀ ਮੁਖਵਾਕ ਪਾਤਿਸ਼ਾਹੀ ੧੦ ॥", 10)).toBe("author");
  });

  it("does not let a keyword claim a second number after its own", () => {
    // ਆਸਾ ਮਹਲਾ ੫ ਦੁਤੁਕੇ ੯ — the ੫ is the mahalla, the ੯ counts the
    // dutukas. Once ਮਹਲਾ's number is spent, it must not reach past it.
    const found = extractNumerals("ਆਸਾ ਮਹਲਾ ੫ ਦੁਤੁਕੇ ੯ ॥");
    expect(found.map((n) => [n.value, n.role])).toEqual([
      [5, "author"],
      [9, "heading_other"],
    ]);
  });

  it("keeps each keyword's own number through a long counted heading", () => {
    const found = extractNumerals(
      "ਆਸਾ ਸ੍ਰੀ ਕਬੀਰ ਜੀਉ ਕੇ ਤਿਪਦੇ ੮ ਦੁਤੁਕੇ ੭ ਇਕਤੁਕਾ ੧"
    );
    expect(found.map((n) => n.value)).toEqual([8, 7, 1]);
    expect(found.every((n) => n.role === "heading_other")).toBe(true);
  });
});

describe("extractNumerals — ghar numbers (ਘਰੁ)", () => {
  it("classifies the number after ਘਰੁ", () => {
    expect(roleOf("ਸਿਰੀਰਾਗੁ ਮਹਲਾ ੧ ਘਰੁ ੨ ॥", 2)).toBe("ghar");
  });

  it("gives each number in one heading its own role — nearest keyword wins", () => {
    const found = extractNumerals("ਰਾਗੁ ਸਿਰੀਰਾਗੁ ਮਹਲਾ ਪਹਿਲਾ ੧ ਘਰੁ ੧ ॥");
    expect(found).toHaveLength(2);
    expect(found[0].role).toBe("author");
    expect(found[1].role).toBe("ghar");
    expect(found[0].keyword).toBe("ਮਹਲਾ");
    expect(found[1].keyword).toBe("ਘਰੁ");
  });
});

describe("extractNumerals — other heading numbers", () => {
  it("classifies a heading number with no author/ghar keyword", () => {
    expect(roleOf("ਪਉੜੀ ੧੯ : ਗੁਰ ਬ੍ਰਿਛ ਰੂਪ", 19)).toBe("heading_other");
    expect(roleOf("ਪਉੜੀ ੧ (ਮੰਗਲਾਚਰਣ)", 1)).toBe("heading_other");
  });

  it("classifies a bare leading number in a title line", () => {
    expect(roleOf("੧੮ : ਸਿੱਖੀ ਸਰਬ ਸ਼ਿਰੋਮਣੀ ਹੈ", 18)).toBe("heading_other");
  });

  it("does not reach back across a danda for a keyword", () => {
    // The ਮਹਲਾ belongs to the heading that the danda closed; the trailing
    // number is not its author number.
    expect(roleOf("ਆਸਾ ਮਹਲਾ ੫ ॥ ਕੋਈ ਤੁਕ ੭", 7)).toBe("heading_other");
  });
});

describe("extractNumerals — shape of the result", () => {
  it("returns nothing for a line with no digits", () => {
    expect(extractNumerals("ੴ ਸਤਿ ਨਾਮੁ ਕਰਤਾ ਪੁਰਖੁ")).toEqual([]);
    expect(extractNumerals("")).toEqual([]);
  });

  it("reports the raw text and its character offset for highlighting", () => {
    const line = "ਆਸਾ ਮਹਲਾ ੫ ॥";
    const [hit] = extractNumerals(line);
    expect(hit.raw).toBe("੫");
    expect(line.slice(hit.start, hit.end)).toBe("੫");
    expect(hit.value).toBe(5);
  });

  it("orders occurrences left to right", () => {
    const found = extractNumerals("ਸਿਰੀਰਾਗੁ ਮਹਲਾ ੧ ਘਰੁ ੨ ॥ ਕੋਈ ਤੁਕ ॥੩॥੪॥");
    expect(found.map((n) => n.value)).toEqual([1, 2, 3, 4]);
    expect(found.map((n) => n.role)).toEqual([
      "author",
      "ghar",
      "verse_marker",
      "verse_marker",
    ]);
  });

  it("exposes every role in NUMERAL_ROLES", () => {
    expect([...NUMERAL_ROLES].sort()).toEqual(
      ["author", "ghar", "heading_other", "verse_marker"].sort()
    );
  });

  it("defaults to the heading roles, with verse markers opt-in", () => {
    expect([...DEFAULT_NUMERAL_ROLES]).toEqual(["author", "ghar", "heading_other"]);
    expect(DEFAULT_NUMERAL_ROLES).not.toContain("verse_marker");
  });

  it("labels every role", () => {
    for (const role of NUMERAL_ROLES) {
      expect(NUMERAL_ROLE_LABELS[role]).toBeTruthy();
    }
  });
});
