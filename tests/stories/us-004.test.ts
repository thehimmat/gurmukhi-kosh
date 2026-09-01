// US-004: See grammar with scholarly citations grouped by attribute (active).
// Criteria: user-stories/US-004-grammar-with-scholarly-citations-by-attribute.md

import { describe, it, expect, beforeAll } from "vitest";
import { anonDb } from "./helpers";
import { buildGrammarView } from "../../lib/grammar-view";
import { fetchMorphVariants, fetchRulesByCode } from "../../lib/word-data";
import type { WordGrammarWithRule } from "../../lib/supabase";

function grammarRow(over: Record<string, unknown>): WordGrammarWithRule {
  return {
    id: 1, word_id: 1, definition_id: null,
    pos: null, gender: null, number: null, gram_case: null,
    notes: null, rule_code: null, confidence: null,
    person: null, verb_form: null, source_code: null, source_line_id: null,
    provenance: "rule_derived", review_status: "unreviewed",
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

  it("US-004: grammar coverage exists at corpus scale (20k+ rows)", async () => {
    const { count, error } = await db
      .from("word_grammar")
      .select("id", { count: "exact", head: true });
    expect(error).toBeNull();
    expect(count).toBeGreaterThan(20000);
  });

  it("US-004: a word in multiple lexemes still lists its related forms (PR #89 regression)", async () => {
    const { data: w } = await db.from("words").select("id").eq("gurmukhi", "ਅਗਨਿ").single();
    expect(w).toBeTruthy();
    const rules = await fetchRulesByCode();
    const variants = await fetchMorphVariants((w as { id: number }).id, "ਅਗਨਿ", rules);
    expect(variants.length).toBeGreaterThan(0);
  });
});
