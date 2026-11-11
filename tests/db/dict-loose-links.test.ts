/**
 * Migration 092: looser automatic links from dictionary entries to Kosh words, for curator research
 * (#249). Below exact (1.0) and fold (0.5) come:
 *   loose (0.3): a key that also ignores halant, ਵ/ਬ, ਯ/ਜ, ਞ/ਨ, kṣ (ਕਸ਼) as ਖ, jñā (ਜਞਾ) as ਗਿਆ,
 *                and a final vowel sign — the usual gaps between a Sanskrit spelling and Gurbani's;
 *   stem (0.2):  Sanskrit sources only, and only for an entry nothing else links — the headword
 *                without a final -n or -s stem consonant (nāman, rājan, yogin, manas), then the loose key.
 * Keys of fewer than two letters never link loosely.
 */
import { describe, it, expect, beforeAll } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshDb } from "./replay";
import { dictEntriesLoadSql, type DictEntry } from "../../pipeline/shared/dict-entries";
import { foldGurmukhi } from "../../lib/gurmukhi-fold";

const key = async (d: PGlite, fn: string, s: string) =>
  (await d.query<{ k: string | null }>(`select ${fn}($1) as k`, [foldGurmukhi(s)])).rows[0].k;
const stemKey = async (d: PGlite, s: string, native: string) =>
  (await d.query<{ k: string | null }>("select dict_stem_key($1, $2) as k", [foldGurmukhi(s), native])).rows[0].k;

const entry = (ref: string, headword: string, native = headword): DictEntry => ({
  entry_ref: ref,
  headword_native: native,
  script: "gurmukhi",
  headword_gurmukhi: headword,
  body_raw: `entry for ${headword}`,
});

let db: PGlite;
beforeAll(async () => {
  db = await freshDb();
  const words: Array<[number, string]> = [
    [9301, "ਨਾਮੁ"], [9302, "ਰਾਜਾ"], [9303, "ਪਰਸਾਦਿ"], [9304, "ਗਿਆਨੁ"], [9305, "ਜੋਗੀ"], [9306, "ਮਨੁ"],
    [9307, "ਨ"], [9308, "ਬੇਦ"], [9309, "ਗਿਆ"], [9310, "ਤਰਜੇ"],
  ];
  for (const [id, g] of words) {
    await db.query("insert into words (id, gurmukhi, search_fold) values ($1, $2, $3)", [id, g, foldGurmukhi(g)]);
  }
  const mw = [
    entry("cologne_mw:L1", "ਨਾਮਨ", "नामन्"), entry("cologne_mw:L2", "ਰਾਜਨ", "राजन्"), entry("cologne_mw:L3", "ਪ੍ਰਸਾਦ", "प्रसाद"),
    entry("cologne_mw:L4", "ਜਞਾਨ", "ज्ञान"), entry("cologne_mw:L5", "ਯੋਗਿਨ", "योगिन्"), entry("cologne_mw:L6", "ਮਨਸ", "मनस्"),
    entry("cologne_mw:L7", "ਨਾਮ", "नाम"), entry("cologne_mw:L8", "ਵੇਦ", "वेद"), entry("cologne_mw:L9", "ਨਾ", "ना"),
    entry("cologne_mw:L10", "ਤਰਜਨ", "तर्जन"), // an a-stem in -ana: no stem link to ਤਰਜੇ
  ];
  for (const s of dictEntriesLoadSql("cologne_mw", mw).statements) await db.exec(s);
  // SikhRI is a Gurmukhi dictionary: it gets the loose tier but never the Sanskrit stem tier.
  for (const s of dictEntriesLoadSql("sikhri", [entry("sikhri:x1", "ਰਾਜਨ")]).statements) await db.exec(s);
}, 120_000);

const links = async (ref: string) =>
  (
    await db.query<{ gurmukhi: string; match_method: string; confidence: number }>(
      `select w.gurmukhi, l.match_method, l.confidence from dict_entry_links l
         join dict_entries e on e.id = l.entry_id join words w on w.id = l.word_id
        where e.entry_ref = $1 order by w.gurmukhi`,
      [ref],
    )
  ).rows.map((r) => [r.gurmukhi, r.match_method, Math.round(r.confidence * 10) / 10]);

describe("092: dict_loose_key and dict_stem_key", () => {
  it.each([
    ["ਪ੍ਰਸਾਦ", "ਪਰਸਾਦ"], // halant
    ["ਪਰਸਾਦਿ", "ਪਰਸਾਦ"],
    ["ਜਞਾਨ", "ਗਿਆਨ"], // jñā
    ["ਗਿਆਨੁ", "ਗਿਆਨ"],
    ["ਵੇਦ", "ਬੇਦ"], // ਵ/ਬ
    ["ਯੋਗ", "ਜੋਗ"], // ਯ/ਜ
    ["ਕਸ਼ਤ੍ਰਿਯ", "ਖਤਰਿਜ"], // kṣ
    ["ਰਾਜਾ", "ਰਾਜ"], // a final vowel sign
  ])("loose key of %s is %s", async (s, k) => {
    expect(await key(db, "dict_loose_key", s)).toBe(k);
  });

  it("gives no loose key to a one-letter word", async () => {
    expect(await key(db, "dict_loose_key", "ਨ")).toBeNull();
    expect(await key(db, "dict_loose_key", "ਨੀ")).toBeNull();
  });

  it.each([
    ["ਨਾਮਨ", "नामन्", "ਨਾਮ"],
    ["ਰਾਜਨ", "राजन्", "ਰਾਜ"],
    ["ਯੋਗਿਨ", "योगिन्", "ਜੋਗ"],
    ["ਮਨਸ", "मनस्", "ਮਨ"],
    ["ਯਸ਼ਸ", "यशस्", "ਜਸ"],
  ])("stem key of %s (%s) is %s", async (s, native, k) => {
    expect(await stemKey(db, s, native)).toBe(k);
  });

  it("gives no stem key unless the Devanagari headword ends in न् or स्, or when too little is left", async () => {
    expect(await stemKey(db, "ਪ੍ਰਸਾਦ", "प्रसाद")).toBeNull();
    expect(await stemKey(db, "ਤਰਜਨ", "तर्जन")).toBeNull(); // -ana, not a consonant stem
    expect(await stemKey(db, "ਸਦਸ਼", "सदश")).toBeNull();
    expect(await stemKey(db, "ਅਰੁਸ਼", "अरुष्")).toBeNull(); // ṣ, not s
    expect(await stemKey(db, "ਧਨ", "धन्")).toBeNull();
  });
});

describe("092: link_dict_entries' loose and stem tiers", () => {
  it.each([
    ["cologne_mw:L1", [["ਨਾਮੁ", "stem", 0.2]]],
    ["cologne_mw:L2", [["ਰਾਜਾ", "stem", 0.2]]],
    ["cologne_mw:L3", [["ਪਰਸਾਦਿ", "loose", 0.3]]],
    ["cologne_mw:L4", [["ਗਿਆਨੁ", "loose", 0.3]]], // linked, so no stem link to ਗਿਆ
    ["cologne_mw:L5", [["ਜੋਗੀ", "stem", 0.2]]],
    ["cologne_mw:L6", [["ਮਨੁ", "stem", 0.2]]],
    ["cologne_mw:L7", [["ਨਾਮੁ", "fold", 0.5]]], // a closer tier wins
    ["cologne_mw:L8", [["ਬੇਦ", "loose", 0.3]]],
    ["cologne_mw:L9", []], // ਨਾ is too short to link loosely to ਨ
    ["cologne_mw:L10", []],
    ["sikhri:x1", []], // no stem tier outside Sanskrit sources
  ])("%s links %j", async (ref, expected) => {
    expect(await links(ref)).toEqual(expected);
  });

  it("is idempotent", async () => {
    const before = (await db.query("select 1 from dict_entry_links")).rows.length;
    await db.query("select link_dict_entries()");
    expect((await db.query("select 1 from dict_entry_links")).rows.length).toBe(before);
  });

  it("drops a stale unreviewed loose link when the source is reloaded", async () => {
    // ਪ੍ਰਸਾਦ's headword corrected to something unrelated: its loose link to ਪਰਸਾਦਿ must go.
    const fixed = { ...entry("cologne_mw:L3", "ਪ੍ਰਭਾਵ"), body_raw: "corrected" };
    const same = (
      await db.query<{ entry_ref: string; headword_gurmukhi: string }>(
        "select entry_ref, headword_gurmukhi from dict_entries where entry_ref like 'cologne_mw:%' and entry_ref <> 'cologne_mw:L3'",
      )
    ).rows.map((r) => entry(r.entry_ref, r.headword_gurmukhi));
    // (headword_native changes with them; stem links need the Devanagari, so keep L1's)
    same.find((e) => e.entry_ref === "cologne_mw:L1")!.headword_native = "नामन्";
    for (const s of dictEntriesLoadSql("cologne_mw", [...same, fixed]).statements) await db.exec(s);
    expect(await links("cologne_mw:L3")).toEqual([]);
    expect(await links("cologne_mw:L1")).toEqual([["ਨਾਮੁ", "stem", 0.2]]);
  });
});
