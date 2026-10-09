// US-004: See grammar with scholarly citations grouped by attribute (active).
// Criteria: user-stories/US-004-grammar-with-scholarly-citations-by-attribute.md

import { describe, it, expect, beforeAll } from "vitest";
import { anonDb } from "./helpers";
import { buildGrammarView, normalizePos } from "../../lib/grammar-view";
import { fetchPosMap } from "../../lib/word-data";
import { fetchAllRows } from "../../lib/fetch-all-rows";
import type { WordGrammarWithRule } from "../../lib/supabase";

function grammarRow(over: Record<string, unknown>): WordGrammarWithRule {
  return {
    id: 1, word_id: 1, definition_id: null,
    pos: null, gender: null, number: null, gram_case: null,
    notes: null, rule_code: null, confidence: null,
    person: null, verb_form: null, source_code: "mahan_kosh", source_line_id: null,
    provenance: "scraped", review_status: "unreviewed",
    grammar_rules: null,
    ...over,
  } as unknown as WordGrammarWithRule;
}

describe("US-004: grammar grouped by attribute with citations", () => {
  let db: ReturnType<typeof anonDb>;
  beforeAll(() => {
    db = anonDb();
  });

  it("US-004: different sources on one attribute surface as a conflict, not a merge", () => {
    const scholar = grammarRow({
      id: 1, pos: "noun", provenance: "imported", source_code: "ss_padarth",
    });
    const dict = grammarRow({ id: 2, pos: "adjective" });
    const view = buildGrammarView([scholar, dict]);
    const pos = view.find((v) => v.attribute === "pos")!;
    expect(pos.conflict).toBe(true);
    expect(pos.polysemy).toBe(false);
    // The cited scholar leads over the dictionary marker.
    expect(pos.readings[0].attestations[0].sourceKind).toBe("scholar");
  });

  it("US-004: sourced grammar coverage exists at corpus scale (15k+ rows)", async () => {
    const { count, error } = await db
      .from("word_grammar")
      .select("id", { count: "exact", head: true });
    expect(error).toBeNull();
    expect(count).toBeGreaterThan(15000);
  });

  // #30 "no guessing": every stored grammar value is read from a named source.
  it("US-004: every grammar row names its source; none is inferred from spelling", async () => {
    const [unsourced, inferred] = await Promise.all([
      db.from("word_grammar").select("id", { count: "exact", head: true }).is("source_code", null),
      db.from("word_grammar").select("id", { count: "exact", head: true }).eq("provenance", "rule_derived"),
    ]);
    expect(unsourced.error).toBeNull();
    expect(inferred.error).toBeNull();
    expect(unsourced.count).toBe(0);
    expect(inferred.count).toBe(0);
  });

  it("US-004: every related-form membership names the source that asserts it", async () => {
    const { count, error } = await db
      .from("word_forms")
      .select("id", { count: "exact", head: true })
      .is("source_code", null);
    expect(error).toBeNull();
    expect(count).toBe(0);
  });

  // #18: Shackle's inflections notes populate the lexeme/form model, so an
  // inflected form with no entry of its own reaches its headword in one join.
  it("US-004: inflected forms are grouped under a lexeme by Shackle's own memberships (#18)", async () => {
    const { count, error } = await db
      .from("word_forms")
      .select("id", { count: "exact", head: true })
      .eq("source_code", "shackle");
    expect(error).toBeNull();
    expect(count).toBeGreaterThan(2500);

    // ਹੋਵੈ (no definition of its own) is Shackle's pres. 3s. of ਹੋਇ.
    const { data: rows, error: e2 } = await db
      .from("word_forms")
      .select("label_raw, tense_mood, person, number, words!inner(gurmukhi), lexemes!inner(lemma_gurmukhi)")
      .eq("source_code", "shackle")
      .eq("words.gurmukhi", "ਹੋਵੈ");
    expect(e2).toBeNull();
    const reading = (rows ?? []).find(
      (r) => (r.lexemes as unknown as { lemma_gurmukhi: string }).lemma_gurmukhi === "ਹੋਇ"
    );
    expect(reading).toMatchObject({ label_raw: "pres. 3s.", tense_mood: "present", person: "third", number: "singular" });
  });

  // #29: an unmapped label compares as a raw string and fakes a cross-source
  // conflict. A re-ingest that introduces a new Shackle label must fail here.
  it("US-004: every stored Shackle POS label normalizes to a controlled part of speech (#29)", async () => {
    const CONTROLLED = new Set([
      "noun", "adjective", "verb", "verb_transitive", "verb_intransitive", "pronoun",
      "postposition", "preposition", "particle", "adverb", "numeral", "interjection",
      "conjunction", "prefix", "suffix",
    ]);
    const [posMap, rows] = await Promise.all([
      fetchPosMap(db),
      fetchAllRows<{ pos: string }>("shackle word_grammar pos", () =>
        db.from("word_grammar").select("id, pos").eq("source_code", "shackle").not("pos", "is", null).order("id")
      ),
    ]);
    expect(rows.length).toBeGreaterThan(5000);
    const unresolved = new Set<string>();
    for (const r of rows) {
      for (const v of normalizePos("shackle", r.pos, posMap)) if (!CONTROLLED.has(v)) unresolved.add(v);
    }
    expect([...unresolved]).toEqual([]);
  });
});
