// US-001: Read every word of SGGS with a full dictionary entry (delivered).
// Criteria: user-stories/US-001-read-every-word-with-full-dictionary-entry.md

import { describe, it, expect, beforeAll } from "vitest";
import { anonDb, sourceId } from "./helpers";
import { DEFINITION_COLUMNS } from "../../lib/word-data";

describe("US-001: every SGGS word has a full dictionary entry", () => {
  let db: ReturnType<typeof anonDb>;
  beforeAll(() => {
    db = anonDb();
  });

  it("US-001.3: SGGS ingest spans all 1430 angs", async () => {
    const { count, error } = await db
      .from("lines")
      .select("id, sources!inner(code)", { count: "exact", head: true })
      .eq("ang", 1430)
      .eq("sources.code", "sggs_banidb_v2");
    expect(error).toBeNull();
    expect(count).toBeGreaterThan(0);
  });

  it("US-001.1: SGGS attests ~29k words, all occurrence-indexed", async () => {
    const sggs = await sourceId(db, "sggs_banidb_v2");
    const { count, error } = await db
      .from("word_corpus_stats")
      .select("word_id", { count: "exact", head: true })
      .eq("source_fk", sggs);
    expect(error).toBeNull();
    expect(count).toBeGreaterThan(29000);
  });

  it("US-001.2: pronunciation (IPA) is effectively complete", async () => {
    const { count, error } = await db
      .from("words")
      .select("id", { count: "exact", head: true })
      .is("ipa_display", null);
    expect(error).toBeNull();
    expect(count).toBeLessThan(100);
  });

  it("US-001.2: a high-frequency SGGS word carries definitions, grammar, and etymology", async () => {
    const { data: w } = await db.from("words").select("id").eq("gurmukhi", "ਹਰਿ").single();
    expect(w).toBeTruthy();
    const wordId = (w as { id: number }).id;
    const [defs, grammar, etym] = await Promise.all([
      db.from("definitions").select("id", { count: "exact", head: true }).eq("word_id", wordId),
      db.from("word_grammar").select("id", { count: "exact", head: true }).eq("word_id", wordId),
      db.from("etymology").select("id", { count: "exact", head: true }).eq("word_id", wordId),
    ]);
    expect(defs.count).toBeGreaterThan(0);
    expect(grammar.count).toBeGreaterThan(0);
    expect(etym.count).toBeGreaterThan(0);
  });

  // #122: the word page's select dropped definition_en, so English glosses
  // never rendered. Page and API now share DEFINITION_COLUMNS.
  it("US-001.2: the shared definitions select names the English gloss column", () => {
    expect(DEFINITION_COLUMNS.split(",").map((c) => c.trim())).toContain("definition_en");
  });

  it("US-001.2: the shared definitions select carries the English gloss", async () => {
    const { data: w } = await db.from("words").select("id").eq("gurmukhi", "ਹਉਮੈ").single();
    expect(w).toBeTruthy();
    const { data, error } = await db
      .from("definitions")
      .select(DEFINITION_COLUMNS)
      .eq("word_id", (w as { id: number }).id);
    expect(error).toBeNull();
    const glosses = ((data ?? []) as Array<{ definition_en: string | null }>)
      .map((d) => d.definition_en)
      .filter(Boolean);
    expect(glosses.join(" ")).toContain("the false I");
  });
});
