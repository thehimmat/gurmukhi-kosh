import { describe, it, expect } from "vitest";
import { pauriGroups } from "../lib/padarth/pauri";

// Japji shabad 1 as BaniDB stores it (SGGS line ids 1–10): Mool Mantar, the
// ਜਪੁ title and the opening salok close with ॥੧॥, then pauri 1 closes with ॥੧॥.
const JAPJI_SHABAD_1 = [
  "ੴ ਸਤਿ ਨਾਮੁ ਕਰਤਾ ਪੁਰਖੁ ਨਿਰਭਉ ਨਿਰਵੈਰੁ ਅਕਾਲ ਮੂਰਤਿ ਅਜੂਨੀ ਸੈਭੰ ਗੁਰ ਪ੍ਰਸਾਦਿ ॥",
  "॥ ਜਪੁ ॥",
  "ਆਦਿ ਸਚੁ ਜੁਗਾਦਿ ਸਚੁ ॥",
  "ਹੈ ਭੀ ਸਚੁ ਨਾਨਕ ਹੋਸੀ ਭੀ ਸਚੁ ॥੧॥",
  "ਸੋਚੈ ਸੋਚਿ ਨ ਹੋਵਈ ਜੇ ਸੋਚੀ ਲਖ ਵਾਰ ॥",
  "ਚੁਪੈ ਚੁਪ ਨ ਹੋਵਈ ਜੇ ਲਾਇ ਰਹਾ ਲਿਵ ਤਾਰ ॥",
  "ਭੁਖਿਆ ਭੁਖ ਨ ਉਤਰੀ ਜੇ ਬੰਨਾ ਪੁਰੀਆ ਭਾਰ ॥",
  "ਸਹਸ ਸਿਆਣਪਾ ਲਖ ਹੋਹਿ ਤ ਇਕ ਨ ਚਲੈ ਨਾਲਿ ॥",
  "ਕਿਵ ਸਚਿਆਰਾ ਹੋਈਐ ਕਿਵ ਕੂੜੈ ਤੁਟੈ ਪਾਲਿ ॥",
  "ਹੁਕਮਿ ਰਜਾਈ ਚਲਣਾ ਨਾਨਕ ਲਿਖਿਆ ਨਾਲਿ ॥੧॥",
].map((gurmukhi, i) => ({ id: i + 1, gurmukhi }));

const ids = (groups: { id: number }[][]) => groups.map((g) => g.map((l) => l.id));

describe("pauriGroups", () => {
  it("splits Japji shabad 1 into the salok and pauri 1", () => {
    expect(ids(pauriGroups(JAPJI_SHABAD_1))).toEqual([
      [1, 2, 3, 4],
      [5, 6, 7, 8, 9, 10],
    ]);
  });

  it("treats a chained tally (॥੪॥੧੯॥੮੯॥) as one boundary", () => {
    const lines = [
      { id: 1, gurmukhi: "ਸਿਮਰਿ ਸਿਮਰਿ ਸੁਖੁ ਪਾਇਆ ॥" },
      { id: 2, gurmukhi: "ਮਨਿ ਤਨਿ ਮਿਠਾ ਤਿਸੁ ਲਗੈ ਜਿਸੁ ਮਸਤਕਿ ਨਾਨਕ ਲੇਖ ॥੪॥੧੯॥੮੯॥" },
    ];
    expect(ids(pauriGroups(lines))).toEqual([[1, 2]]);
  });

  it("keeps lines after the last tally as their own group", () => {
    const lines = [
      { id: 1, gurmukhi: "ਸੁਣਿਐ ਦੂਖ ਪਾਪ ਕਾ ਨਾਸੁ ॥੮॥" },
      { id: 2, gurmukhi: "ਸੁਣਿਐ ਈਸਰੁ ਬਰਮਾ ਇੰਦੁ ॥" },
    ];
    expect(ids(pauriGroups(lines))).toEqual([[1], [2]]);
  });

  it("does not split at a heading number (ਮਹਲਾ ੧)", () => {
    const lines = [
      { id: 1, gurmukhi: "ਸੋ ਦਰੁ ਰਾਗੁ ਆਸਾ ਮਹਲਾ ੧" },
      { id: 2, gurmukhi: "ੴ ਸਤਿਗੁਰ ਪ੍ਰਸਾਦਿ ॥" },
    ];
    expect(ids(pauriGroups(lines))).toEqual([[1, 2]]);
  });

  it("returns no groups for no lines", () => {
    expect(pauriGroups([])).toEqual([]);
  });
});
