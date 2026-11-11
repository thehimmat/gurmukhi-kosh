/**
 * The curator's Dictionaries tab (/admin/word/<w>?tab=dictionaries): every dictionary entry linked to
 * the word (089, 092), grouped by dictionary, closest matches first.
 */
import { describe, it, expect } from "vitest";
import { dictEntryGroups, MAX_PER_SOURCE, type DictLinkRow } from "../lib/dict-entry-view";

const row = (
  code: string,
  ref: string,
  method: string,
  confidence: number,
  extra: Partial<DictLinkRow["dict_entries"]> = {},
): DictLinkRow => ({
  match_method: method,
  confidence,
  dict_entries: {
    entry_ref: ref,
    headword_native: "नामन्",
    script: "devanagari",
    headword_gurmukhi: "ਨਾਮਨ",
    page: "536,1",
    body_raw: "<s>nAman</s> ¦ n. a name",
    parsed: { iast: "nāman", plain: "nāman ¦ n. a name" },
    source_url: null,
    dict_sources: { code, name: code === "sikhri" ? "SikhRI Guru Granth Sahib Dictionary" : `Dictionary ${code}`, language: code === "sikhri" ? "en" : "sa" },
    ...extra,
  },
});

describe("dictEntryGroups", () => {
  it("groups by dictionary, the dictionary with the closest match first", () => {
    const groups = dictEntryGroups([
      row("cologne_pwg", "cologne_pwg:L5", "stem", 0.2),
      row("cologne_mw", "cologne_mw:L2", "loose", 0.3),
      row("sikhri", "sikhri:wn9", "exact", 1),
      row("cologne_mw", "cologne_mw:L1", "exact", 1),
    ]);
    expect(groups.map((g) => [g.code, g.entries.map((e) => e.ref)])).toEqual([
      ["cologne_mw", ["cologne_mw:L1", "cologne_mw:L2"]],
      ["sikhri", ["sikhri:wn9"]],
      ["cologne_pwg", ["cologne_pwg:L5"]],
    ]);
  });

  it("shows a Sanskrit headword in Devanagari with its IAST, and the readable gloss", () => {
    const [g] = dictEntryGroups([row("cologne_mw", "cologne_mw:L1", "stem", 0.2)]);
    expect(g.entries[0]).toMatchObject({
      headword: "नामन्",
      script: "devanagari",
      iast: "nāman",
      gloss: "nāman — n. a name", // rendered from the csl-orig body (lib/cologne-gloss.ts)
      page: "536,1",
      method: "stem",
      methodLabel: "stem match",
    });
  });

  it("writes an all-Sanskrit kosh's gloss in Devanagari", () => {
    const [g] = dictEntryGroups([row("cologne_skd", "cologne_skd:L1", "loose", 0.3, { body_raw: "nAman¦ klI0 . saMjYA .." })]);
    expect(g.entries[0].gloss).toBe("नामन् क्ली॰ । संज्ञा ॥"); // ॰ is an abbreviation mark, not a zero
  });

  it("shows the raw body for a dictionary that isn't Cologne's (SikhRI)", () => {
    const [g] = dictEntryGroups([
      row("sikhri", "sikhri:wn9", "exact", 1, {
        headword_native: "ਨਾਮੁ", script: "gurmukhi", parsed: { wn: "9" }, body_raw: "Name.\nGrammar: noun", source_url: "https://x/9",
      }),
    ]);
    expect(g.entries[0]).toMatchObject({ headword: "ਨਾਮੁ", iast: null, gloss: "Name.\nGrammar: noun", url: "https://x/9" });
  });

  it(`keeps the first ${MAX_PER_SOURCE} entries per dictionary and counts the rest`, () => {
    const rows = Array.from({ length: MAX_PER_SOURCE + 3 }, (_, i) => row("cologne_skd", `cologne_skd:L${i}`, "loose", 0.3));
    const [g] = dictEntryGroups(rows);
    expect(g.entries).toHaveLength(MAX_PER_SOURCE);
    expect(g.hidden).toBe(3);
  });

  it("skips a link whose entry the reader can't see", () => {
    expect(dictEntryGroups([{ match_method: "exact", confidence: 1, dict_entries: null }])).toEqual([]);
  });
});
