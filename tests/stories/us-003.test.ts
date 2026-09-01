// US-003: Trust every datum through visible source citations/provenance
// (delivered). Criteria: user-stories/US-003-trust-data-through-source-citations-provenance.md

import { describe, it, expect, beforeAll } from "vitest";
import { anonDb, PROD_BASE } from "./helpers";
import { buildGrammarView } from "../../lib/grammar-view";
import type { WordGrammarWithRule } from "../../lib/supabase";

describe("US-003: every datum carries provenance", () => {
  let db: ReturnType<typeof anonDb>;
  beforeAll(() => {
    db = anonDb();
  });

  it("US-003: no definition row is missing provenance", async () => {
    const { count, error } = await db
      .from("definitions")
      .select("id", { count: "exact", head: true })
      .is("provenance", null);
    expect(error).toBeNull();
    expect(count).toBe(0);
  });

  it("US-003: a reading resting on an unverified rule is marked unverified, not scholar-cited", () => {
    const row = {
      id: 1, word_id: 1, definition_id: null,
      pos: null, gender: null, number: "singular", gram_case: "oblique",
      notes: null, rule_code: "MUKTA_OBL_SG", confidence: 0.6,
      person: null, verb_form: null, source_code: null, source_line_id: null,
      provenance: "rule_derived", review_status: "unreviewed",
      grammar_rules: {
        rule_code: "MUKTA_OBL_SG", title: "Mukta ending", explanation: "test",
        citation: null, tier: "codified_rule", verified: false,
      },
    } as unknown as WordGrammarWithRule;
    const view = buildGrammarView([row]);
    const caseView = view.find((v) => v.attribute === "gram_case")!;
    const att = caseView.readings[0].attestations[0];
    expect(att.sourceKind).toBe("rule");
    expect(att.verified).toBe(false);
  });

  it("US-003: the JSON API ships grammar caveats alongside grammar rows", async () => {
    const res = await fetch(`${PROD_BASE}/api/word/${encodeURIComponent("ਨਾਨਕ")}`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { grammar: unknown[]; grammar_caveats: unknown[] };
    expect(Array.isArray(data.grammar)).toBe(true);
    expect(Array.isArray(data.grammar_caveats)).toBe(true);
  });
});
