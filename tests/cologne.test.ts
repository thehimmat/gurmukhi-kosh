/**
 * Cologne Digital Sanskrit Dictionaries (csl-orig), plan Phase 1 (#249): the record parser, the
 * SLP1 → Gurmukhi spelling used for linking, and Monier-Williams 1899 as dict_entries rows.
 */
import { describe, it, expect } from "vitest";
import { slp1ToGurmukhi } from "../pipeline/cologne/slp1-gurmukhi";
import { parseCsl, plainBody } from "../pipeline/cologne/parse";
import { cologneGloss } from "../lib/cologne-gloss";
import { cologneEntries } from "../pipeline/cologne/entries";

describe("slp1ToGurmukhi", () => {
  it.each([
    ["guru", "ਗੁਰੁ"],
    ["nAman", "ਨਾਮਨ"], // no halant on a final consonant
    ["Darma", "ਧਰਮ"], // a cluster is written without a halant…
    ["prasAda", "ਪ੍ਰਸਾਦ"], // …except before ਰ, ਵ, ਹ, which go beneath
    ["svAmin", "ਸ੍ਵਾਮਿਨ"],
    ["kfzRa", "ਕ੍ਰਿਸ਼ਣ"], // ṛ after a consonant is ੍ਰਿ
    ["fzi", "ਰਿਸ਼ਿ"], // initial ṛ is ਰਿ
    ["SrI", "ਸ਼੍ਰੀ"],
    ["anta", "ਅੰਤ"], // a nasal before a stop is tippi
    ["anna", "ਅੰਨ"],
    ["SaNKa", "ਸ਼ੰਖ"],
    ["aMSa", "ਅੰਸ਼"], // anusvāra is tippi
    ["amfta", "ਅਮ੍ਰਿਤ"],
    ["duHKa", "ਦੁਃਖ"],
    ["Ekya", "ਐਕਯ"],
    ["oM", "ਓੰ"],
    ["a/gni", "ਅਗਨਿ"], // accents are dropped
  ])("%s → %s", (slp1, gurmukhi) => {
    expect(slp1ToGurmukhi(slp1)).toBe(gurmukhi);
  });

  it("returns null for anything that isn't SLP1", () => {
    expect(slp1ToGurmukhi("kṛṣṇa")).toBeNull();
    expect(slp1ToGurmukhi("")).toBeNull();
  });
});

const SAMPLE = [
  "<L>1<pc>1,1<k1>a<k2>a<h>1<e>1",
  "<hom>1.</hom> <s>a</s> ¦ the first letter of the alphabet",
  "<LEND>",
  "<L>1.1<pc>1,1<k1>a<k2>a<e>1A",
  "¦ the first short vowel inherent in consonants.",
  "<LEND>",
  "<L>2<pc>1,1<k1>akAra<k2>a—kAra<e>3",
  "<s>a—kAra</s> ¦ <lex>m.</lex> the letter or sound <s>a</s>.<info lex=\"m\"/>",
  "<LEND>",
].join("\n");

describe("parseCsl", () => {
  it("reads one record per <L>, keeping its keys and text", () => {
    const recs = parseCsl(SAMPLE);
    expect(recs.map((r) => [r.L, r.k1, r.k2, r.h, r.e, r.pc])).toEqual([
      ["1", "a", "a", "1", "1", "1,1"],
      ["1.1", "a", "a", null, "1A", "1,1"],
      ["2", "akAra", "a—kAra", null, "3", "1,1"],
    ]);
    expect(recs[2].text).toBe("<s>a—kAra</s> ¦ <lex>m.</lex> the letter or sound <s>a</s>.<info lex=\"m\"/>");
  });

  it("ends a record at a <LEND> with stray characters after it (mw L196225 has `<LEND><`)", () => {
    const recs = parseCsl("<L>1<pc>1,1<k1>a<k2>a<e>1\ntext\n<LEND><\n<L>2<pc>1,1<k1>i<k2>i<e>1\nmore\n<LEND>");
    expect(recs.map((r) => [r.L, r.text])).toEqual([["1", "text"], ["2", "more"]]);
  });

  it("reads a header with no <e> level, as every dictionary but MW writes it", () => {
    const [r] = parseCsl("<L>1<pc>0001-a<k1>a<k2>a<h>1\ntext\n<LEND>");
    expect([r.L, r.pc, r.k1, r.h, r.e]).toEqual(["1", "0001-a", "a", "1", ""]);
    expect(cologneEntries("cologne_ap90", [r])[0].parsed).not.toHaveProperty("parent");
  });

  it("refuses a record with no <LEND>", () => {
    expect(() => parseCsl("<L>1<pc>1,1<k1>a<k2>a<e>1\ntext")).toThrow(/LEND/);
  });

  it("renders a plain body: Sanskrit in IAST, tags and info dropped", () => {
    const [, , akara] = parseCsl(SAMPLE);
    expect(plainBody(akara.text)).toBe("a—kāra ¦ m. the letter or sound a.");
  });
});

describe("cologneEntries (Monier-Williams 1899)", () => {
  const entries = cologneEntries("cologne_mw", parseCsl(SAMPLE));

  it("keys each record by its L number, which Cologne keeps stable", () => {
    expect(entries.map((e) => e.entry_ref)).toEqual(["cologne_mw:L1", "cologne_mw:L1.1", "cologne_mw:L2"]);
    expect(entries.map((e) => e.seq)).toEqual([1, 2, 3]);
  });

  it("prints the headword in Devanagari and links on its Gurmukhi spelling", () => {
    expect(entries[2]).toMatchObject({
      headword_native: "अकार",
      script: "devanagari",
      headword_gurmukhi: "ਅਕਾਰ",
      page: "1,1",
    });
  });

  it("keeps the source markup as the body and the keys under parsed", () => {
    expect(entries[2].body_raw).toBe(parseCsl(SAMPLE)[2].text);
    expect(entries[0].parsed).toEqual({ k1: "a", k2: "a", h: "1", e: "1", iast: "a", plain: "1. a ¦ the first letter of the alphabet" });
    // a continuation sense (e 1A) belongs to the entry before it
    expect((entries[1].parsed as { parent: string }).parent).toBe("cologne_mw:L1");
  });
});

describe("cologneGloss: a readable gloss from any csl-orig body", () => {
  it.each([
    // MW: <s> Sanskrit, accents dropped; a continuation record's leading ¦ goes
    ["<hom>1.</hom> <s>nA/ma</s> ¦ ind. by name", "1. nāma — ind. by name"],
    ["¦ indeed, certainly, really", "indeed, certainly, really"],
    // Apte: {#…#} Sanskrit, {%…%} italic, {@…@} bold, hard-wrapped lines
    ["{#nAman#}¦ {%n.%} {@1@} A name,\nappellation, personal name (opp. {#gotra#});", "nāman — n. 1 A name, appellation, personal name (opp. gotra);"],
    // PWG: German, page marker, <ls> and <lex>
    ["{#a/cCinna#}¦ <lex>adj.</lex> {%nicht zerrissen%}: <ls>ṚV. 10,133,7</ls>. [Page1-0064]", "acchinna — adj. nicht zerrissen: ṚV. 10,133,7."],
    // Grassmann/Edgerton: {@…@} already in IAST, a <div> marker
    ["{@apā́kṛti,@}¦ <ab>f.</ab>, {%Fernhaltung%}\n<div n=\"TS\">-im {667,2}.", "apā́kṛti, — f., Fernhaltung -im {667,2}."],
  ])("%s", (body, gloss) => {
    expect(cologneGloss(body)).toBe(gloss);
  });

  it("writes an all-Sanskrit kosh (Śabdakalpadruma, Vācaspatyam) in Devanagari, rejoining broken words", () => {
    expect(cologneGloss("ativAdaH¦, puM, (ati + vad + BAve GaY .) aBi-\nvAdaH . paruzoktiH ..", "devanagari"))
      .toBe("अतिवादः, पुं, (अति + वद् + भावे घञ् ।) अभिवादः । परुषोक्तिः ॥");
  });
});
