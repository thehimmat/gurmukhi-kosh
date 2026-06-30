import { describe, it, expect } from "vitest";
import { buildGrammarView, confidenceBand } from "../lib/grammar-view";
import type { WordGrammarWithRule } from "../lib/supabase";

// Minimal row factory; only the fields buildGrammarView reads matter.
function row(p: Partial<WordGrammarWithRule>): WordGrammarWithRule {
  return {
    id: Math.random(),
    word_id: 1,
    definition_id: null,
    pos: null,
    gender: null,
    number: null,
    gram_case: null,
    notes: null,
    rule_code: null,
    confidence: null,
    person: null,
    verb_form: null,
    source_code: null,
    source_line_id: null,
    provenance: "rule_derived",
    review_status: "unreviewed",
    grammar_rules: null,
    ...p,
  } as WordGrammarWithRule;
}

const rule = (over: Partial<NonNullable<WordGrammarWithRule["grammar_rules"]>>) => ({
  rule_code: "X",
  title: "t",
  explanation: "e",
  citation: "c",
  tier: "codified_rule" as const,
  verified: false,
  ...over,
});

describe("confidenceBand", () => {
  it("maps scores to qualitative bands and never to a number", () => {
    expect(confidenceBand(0.9)).toBe("Very high");
    expect(confidenceBand(0.8)).toBe("High");
    expect(confidenceBand(0.6)).toBe("Moderate");
    expect(confidenceBand(0.45)).toBe("Low");
    expect(confidenceBand(0.2)).toBe("Very low");
  });
  it("returns null for a cited fact (no probabilistic confidence)", () => {
    expect(confidenceBand(null)).toBeNull();
    expect(confidenceBand(undefined)).toBeNull();
  });
});

describe("buildGrammarView", () => {
  it("corroborates when a scholar and a rule agree (ਵੀਚਾਰੁ masculine)", () => {
    const view = buildGrammarView([
      row({
        provenance: "imported",
        gender: "masculine",
        source_code: "ss_padarth",
        source_line_id: 141,
        rule_code: "SS_PADARTH_GENDER",
        grammar_rules: rule({ rule_code: "SS_PADARTH_GENDER", tier: "source_extraction", verified: true, citation: "Darpan pad-arth" }),
      }),
      row({
        provenance: "rule_derived",
        gender: "masculine",
        confidence: 0.85,
        rule_code: "AUNKAR_NOM_SG",
        grammar_rules: rule({ rule_code: "AUNKAR_NOM_SG", verified: true }),
      }),
    ]);
    const gender = view.find((v) => v.attribute === "gender")!;
    expect(gender.conflict).toBe(false);
    expect(gender.readings).toHaveLength(1);
    expect(gender.readings[0].value).toBe("masculine");
    // Two distinct sources corroborate, scholar listed first.
    expect(gender.readings[0].attestations).toHaveLength(2);
    expect(gender.readings[0].attestations[0].sourceKind).toBe("scholar");
    expect(gender.readings[0].attestations[1].sourceKind).toBe("rule");
  });

  it("flags a conflict and leads with the scholar (ਤਿਨ: plural vs rule singular)", () => {
    const view = buildGrammarView([
      row({
        provenance: "imported",
        number: "plural",
        source_code: "ss_padarth",
        source_line_id: 300,
        rule_code: "SS_PADARTH_NUMBER",
        grammar_rules: rule({ rule_code: "SS_PADARTH_NUMBER", tier: "source_extraction", verified: true }),
      }),
      row({
        provenance: "rule_derived",
        pos: "pronoun",
        number: "singular",
        confidence: 0.7,
        rule_code: "MUKTA_OBL_SG",
        grammar_rules: rule({ rule_code: "MUKTA_OBL_SG", verified: false }),
      }),
    ]);
    const number = view.find((v) => v.attribute === "number")!;
    expect(number.conflict).toBe(true);
    expect(number.readings[0].value).toBe("plural"); // scholar leads
    expect(number.readings[0].attestations[0].sourceKind).toBe("scholar");
    expect(number.readings[1].value).toBe("singular"); // rule reading demoted
    expect(number.readings[1].attestations[0].sourceKind).toBe("rule");
    expect(number.readings[1].attestations[0].confidenceLabel).toBe("High");
  });

  it("attributes a rule row's POS to Mahan Kosh, not its case rule_code (ਕੋਟਿ)", () => {
    const view = buildGrammarView([
      row({
        provenance: "imported",
        pos: "adjective",
        rule_code: "SS_PADARTH_POS",
        grammar_rules: rule({ rule_code: "SS_PADARTH_POS", tier: "source_extraction", verified: true }),
      }),
      row({
        provenance: "rule_derived",
        pos: "noun",
        gram_case: "oblique",
        confidence: 0.8,
        rule_code: "SIHARI_OBL_SG",
        grammar_rules: rule({ rule_code: "SIHARI_OBL_SG", verified: false }),
      }),
    ]);
    const pos = view.find((v) => v.attribute === "pos")!;
    expect(pos.conflict).toBe(true);
    expect(pos.readings[0].value).toBe("adjective"); // scholar leads
    // the rule-derived noun POS is attributed to the dictionary, not the rule
    const nounReading = pos.readings.find((r) => r.value === "noun")!;
    expect(nounReading.attestations[0].sourceKind).toBe("dictionary");
  });

  it("labels an inherited POS as a heuristic with a confidence band", () => {
    const view = buildGrammarView([
      row({ provenance: "rule_derived", pos: "noun", confidence: 0.6, notes: "POS inherited from lemma ਹੁਕਮ." }),
    ]);
    const att = view.find((v) => v.attribute === "pos")!.readings[0].attestations[0];
    expect(att.sourceKind).toBe("heuristic");
    expect(att.confidenceLabel).toBe("Moderate");
  });

  it("omits attributes with no asserted value and orders POS→Gender→Number→Case", () => {
    const view = buildGrammarView([
      row({ provenance: "rule_derived", gram_case: "nominative", gender: "masculine", confidence: 0.85, grammar_rules: rule({}) }),
    ]);
    expect(view.map((v) => v.attribute)).toEqual(["gender", "gram_case"]);
  });
});
