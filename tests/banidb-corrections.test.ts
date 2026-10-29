/**
 * BaniDB lines we know are mistyped (pipeline/sggs/corrections.ts): the ingest swaps in the
 * corrected line, and migrations 073 (typos), 076 and 077 (ਾਂ after a vowel sign) and 078 (follow-ups)
 * fix the copy already loaded.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { CORRECTIONS, FOLLOW_UPS, TYPOS, correctLine } from "../pipeline/sggs/corrections";
import { NASAL, NASAL_HI } from "../pipeline/sggs/nasal-corrections";

const sql = (f: string) => readFileSync(`supabase/migrations/${f}`, "utf8");
const dasam = CORRECTIONS.dasam_banidb_v2;

// Two vowel signs on one letter, the pattern that found most of these.
const MATRA = "[ਾ-ੂੇੈੋੌ]";
const DOUBLE_VOWEL = new RegExp(`[ਅ-ਔਾ-ੂੇੈੋੌ][ਁ-ਃ਼੍ੑੰੱੵ]*${MATRA}`);

describe("BaniDB line corrections", () => {
  it("swaps in the corrected line and transliteration", () => {
    const c = dasam.find((x) => x.verseId === 80315)!;
    expect(correctLine("dasam_banidb_v2", 80315, c.from, c.translitFrom)).toEqual({
      gurmukhi: "ਦੁਹਾ ਕੰਧਾਰਾ ਮੁਹਿ ਜੁੜੇ ਅਣੀਆਰਾ ਚੋਈਆਂ ॥",
      transliteration: "dhuhaa ka(n)dhaaraa muh juRe aneeaaraa choieeaa(n) ||",
      status: "corrected",
    });
  });

  it("keeps BaniDB's line when it no longer reads as we recorded it", () => {
    const got = correctLine("dasam_banidb_v2", 80315, "ਦੁਹਾ ਕੰਧਾਰਾ ਮੁਹਿ ਜੁੜੇ ਅਣੀਆਰਾ ਚੋਈਆਂ ॥", "x");
    expect(got).toEqual({ gurmukhi: "ਦੁਹਾ ਕੰਧਾਰਾ ਮੁਹਿ ਜੁੜੇ ਅਣੀਆਰਾ ਚੋਈਆਂ ॥", transliteration: "x", status: "stale" });
  });

  it("applies a follow-up on top of an earlier correction of the same line", () => {
    const first = TYPOS.find((x) => x.verseId === 130267)!;
    const next = FOLLOW_UPS.find((x) => x.verseId === 130267)!;
    expect(next.from).toBe(first.to);
    expect(correctLine("dasam_banidb_v2", 130267, first.from, first.translitFrom)).toEqual({
      gurmukhi: "ਤੈਂ ਮੂਜੀ ਪੀ ਭਾਂਗ ਕਹੋ ਕਾ ਕਾਜ ਸਵਰਿ ਹੈਂ ॥",
      transliteration: "tai(n) moojee pee bhaa(n)g kaho kaa kaaj savar hai(n) ||",
      status: "corrected",
    });
  });

  it("leaves every other line alone", () => {
    expect(correctLine("dasam_banidb_v2", 1, "ਭਾਗ", "bhaag")).toEqual({ gurmukhi: "ਭਾਗ", transliteration: "bhaag", status: "none" });
    expect(correctLine("sggs_banidb_v2", 80315, "ਮੁਿਹ", "mueh").status).toBe("none");
  });

  it("changes something in every entry, and cites where", () => {
    for (const c of dasam) {
      expect(c.to, `verse ${c.verseId}`).not.toBe(c.from);
      expect(c.evidence.length, `verse ${c.verseId}`).toBeGreaterThan(10);
    }
    for (const list of [TYPOS, NASAL, NASAL_HI, FOLLOW_UPS]) {
      expect(new Set(list.map((c) => c.verseId)).size).toBe(list.length);
    }
  });

  it("leaves no two vowel signs on one letter", () => {
    for (const c of dasam) expect(c.to, `verse ${c.verseId}`).not.toMatch(DOUBLE_VOWEL);
  });

  it("holds each list once", () => {
    expect(dasam).toEqual([...TYPOS, ...NASAL, ...NASAL_HI, ...FOLLOW_UPS]);
  });

  for (const [file, list] of [["073_dasam_banidb_corrections.sql", TYPOS], ["076_dasam_kanna_nasal.sql", NASAL], ["077_dasam_hi_nasal.sql", NASAL_HI], ["078_mark_order.sql", FOLLOW_UPS]] as const) {
    it(`is what migration ${file.slice(0, 3)} applies to the loaded copy`, () => {
      const migration = sql(file);
      for (const c of list) {
        for (const s of [String(c.verseId), c.from, c.to, c.translitFrom, c.translitTo]) {
          expect(migration, `verse ${c.verseId}: ${s}`).toContain(s.replaceAll("'", "''"));
        }
      }
    });
  }

  it("leaves no ਾਂ after a vowel sign", () => {
    for (const c of dasam) expect(c.to, `verse ${c.verseId}`).not.toMatch(/[ਿੀੁੂੇੈੋੌਉਊਏ]ਾਂ/);
  });

  it("changes only the ਾਂ words, keeping the line's word count", () => {
    for (const c of [...NASAL, ...NASAL_HI]) {
      expect(c.to.split(" ").length, `verse ${c.verseId}`).toBe(c.from.split(" ").length);
      expect(c.translitTo.split(" ").length, `verse ${c.verseId}`).toBe(c.translitFrom.split(" ").length);
      expect(c.from, `verse ${c.verseId}`).toMatch(/[ਿੀੁੂੇੈੋੌਉਊਏ]ਾਂ/);
    }
  });
});
