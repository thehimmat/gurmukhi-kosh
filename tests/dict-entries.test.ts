/**
 * The raw dictionary-entry layer (plan Phase 0, #249): entry refs, the load checksum, the SQL
 * loader, and the SikhRI adapter that merges the English and Panjabi crawls per entry.
 */
import { describe, it, expect } from "vitest";
import { entryRef, entriesChecksum, dictEntriesLoadSql, type DictEntry } from "../pipeline/shared/dict-entries";
import { sikhriEntries } from "../pipeline/sikhri/entries";

const entry = (ref: string, body: string, extra: Partial<DictEntry> = {}): DictEntry => ({
  entry_ref: ref,
  headword_native: "ਨਾਮੁ",
  script: "gurmukhi",
  headword_gurmukhi: "ਨਾਮੁ",
  body_raw: body,
  ...extra,
});

describe("entryRef", () => {
  it("joins the source code and a source-stable key", () => {
    expect(entryRef("mahan_kosh", "ਨਾਮ#2")).toBe("mahan_kosh:ਨਾਮ#2");
    expect(entryRef("sikhri", "wn33071")).toBe("sikhri:wn33071");
  });

  it("rejects a malformed code or an empty key", () => {
    expect(() => entryRef("Mahan Kosh", "x")).toThrow();
    expect(() => entryRef("sikhri", " ")).toThrow();
  });
});

describe("entriesChecksum", () => {
  it("ignores input order", () => {
    const a = [entry("s:a", "one"), entry("s:b", "two")];
    expect(entriesChecksum(a)).toBe(entriesChecksum([...a].reverse()));
  });

  it("changes when a body changes", () => {
    expect(entriesChecksum([entry("s:a", "one")])).not.toBe(entriesChecksum([entry("s:a", "One")]));
  });
});

describe("dictEntriesLoadSql", () => {
  it("refuses an entry whose ref doesn't belong to the source", () => {
    expect(() => dictEntriesLoadSql("sikhri", [entry("shackle:x", "b")])).toThrow(/sikhri:/);
  });

  it("refuses duplicate refs", () => {
    expect(() => dictEntriesLoadSql("sikhri", [entry("sikhri:a", "b"), entry("sikhri:a", "c")])).toThrow(/duplicate/);
  });

  it("splits the upsert into batches and links once at the end", () => {
    const entries = Array.from({ length: 5 }, (_, i) => entry(`sikhri:wn${i}`, `body ${i}`));
    const { statements, checksum } = dictEntriesLoadSql("sikhri", entries, { batchSize: 2 });
    expect(statements[0]).toMatch(/^delete from dict_entries/);
    expect(statements.filter((s) => s.startsWith("insert into dict_entries"))).toHaveLength(3);
    expect(statements.at(-1)).toMatch(/link_dict_entries\('sikhri'\)/);
    expect(checksum).toBe(entriesChecksum(entries));
  });

  it("quotes text safely", () => {
    const { statements } = dictEntriesLoadSql("sikhri", [entry("sikhri:a", "it's")]);
    expect(statements.join("\n")).toContain("'it''s'");
  });
});

describe("sikhriEntries", () => {
  const en = [
    { gurmukhi: "ਅਉਰ", wn: "MjIyNTQ=", wn_id: "22254", found: true, headword_roman: "aür",
      meaning: "of other.", grammar: "pronoun", etymology: "Awadhi - aür", source_url: "https://x/en/aür" },
    { gurmukhi: null, wn: "OTk=", wn_id: "99", found: true, headword_roman: "cahu",
      meaning: "four.", grammar: null, etymology: null, source_url: "https://x/en/cahu" },
    { gurmukhi: "ਨਾਮੁ", gurmukhi_inferred: true, wn: "Nw==", wn_id: "7", found: true, headword_roman: "nāmu",
      meaning: "name.", grammar: null, etymology: null, source_url: "https://x/en/nāmu" },
  ];
  const pa = [
    { lang: "pa", gurmukhi: "ਅਉਰ", wn: "MjIyNTQ=", wn_id: "22254", found: true,
      meaning: "ਹੋਰ ਦੇ।", grammar: "ਪੜਨਾਂਵ", etymology: null, source_url: "https://x/pa/ਅਉਰ" },
    { lang: "pa", gurmukhi: "ਸਉਣ", wn: "MjY0NDQ=", wn_id: "26444", found: true,
      meaning: "ਸਗਨ।", grammar: null, etymology: null, source_url: "https://x/pa/ਸਉਣ" },
  ];
  const byRef = (rows: DictEntry[]) => new Map(rows.map((r) => [r.entry_ref, r]));

  it("makes one entry per wn, keyed by SikhRI's own id", () => {
    const rows = sikhriEntries(en, pa);
    expect(rows.map((r) => r.entry_ref).sort()).toEqual(["sikhri:wn22254", "sikhri:wn26444", "sikhri:wn7", "sikhri:wn99"]);
  });

  it("merges both editions into one entry", () => {
    const e = byRef(sikhriEntries(en, pa)).get("sikhri:wn22254")!;
    expect(e.headword_gurmukhi).toBe("ਅਉਰ");
    expect(e.parsed).toMatchObject({
      roman: "aür",
      en: { meaning: "of other.", grammar: "pronoun", etymology: "Awadhi - aür", url: "https://x/en/aür" },
      pa: { meaning: "ਹੋਰ ਦੇ।", grammar: "ਪੜਨਾਂਵ", url: "https://x/pa/ਅਉਰ" },
    });
    expect(e.body_raw).toContain("of other.");
    expect(e.body_raw).toContain("ਹੋਰ ਦੇ।");
  });

  it("keeps a Panjabi-only entry", () => {
    const e = byRef(sikhriEntries(en, pa)).get("sikhri:wn26444")!;
    expect(e.headword_gurmukhi).toBe("ਸਉਣ");
    expect(e.parsed).toMatchObject({ pa: { meaning: "ਸਗਨ।" } });
    expect((e.parsed as { en?: unknown }).en).toBeUndefined();
  });

  it("stores an entry with no Gurmukhi under its romanization", () => {
    const e = byRef(sikhriEntries(en, pa)).get("sikhri:wn99")!;
    expect(e).toMatchObject({ headword_native: "cahu", script: "latin", headword_gurmukhi: null });
  });

  it("marks an inferred Gurmukhi spelling", () => {
    const e = byRef(sikhriEntries(en, pa)).get("sikhri:wn7")!;
    expect(e.parsed).toMatchObject({ gurmukhi_inferred: true });
  });

  it("drops lines with no content", () => {
    const rows = sikhriEntries([{ ...en[1], wn: "MQ==", wn_id: "1", found: false, meaning: null }], []);
    expect(rows).toEqual([]);
  });
});
