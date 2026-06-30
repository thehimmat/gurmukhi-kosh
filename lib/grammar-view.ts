// Grammar presentation model.
//
// The word page stores grammar as word_grammar rows, but a single rule-derived
// row is multi-attribute (POS + case + number together) and mixes provenance
// WITHIN the row: its POS is read from Mahan Kosh while its case/number come from
// a Viakaran rule. To show each datum honestly — corroborated when independent
// sources agree, flagged when they conflict — we decompose every row into
// per-attribute facts, then regroup by attribute.
//
// Output, per attribute (POS / Gender / Number / Case):
//   - readings sorted by source authority (a cited scholar outranks our rule);
//   - the lead reading [0] is what we present; a corroboration count when several
//     sources back it; a conflict flag when sources disagree.
// This module is pure and deterministic so it can be unit-tested.

import type { WordGrammarWithRule } from "./supabase";

export type GrammarAttribute = "pos" | "gender" | "number" | "gram_case";

// How a single source supports a value. Ordered by authority (highest first).
export type SourceKind = "scholar" | "dictionary" | "rule" | "heuristic";

const AUTHORITY: Record<SourceKind, number> = {
  scholar: 4, // explicit statement read from a cited scholar (Sahib Singh's pad-arth)
  dictionary: 3, // extracted from a dictionary's own marker (Mahan Kosh POS)
  rule: 2, // our codified Viakaran rule
  heuristic: 1, // our own grouping/inheritance heuristic
};

export interface Attestation {
  sourceKind: SourceKind;
  sourceLabel: string; // short human label, e.g. "Sahib Singh's Darpan pad-arth"
  citation: string | null; // full citation string when we have one
  explanation: string | null; // the rule's plain-English basis, when applicable
  verified: boolean; // scholar-verified / read-from-source
  confidenceLabel: string | null; // qualitative band for rule/heuristic; null when cited
  lineId: number | null; // pad-arth source_line_id, for "view the line" links
  ruleCode: string | null;
}

export interface AttributeReading {
  value: string;
  attestations: Attestation[]; // distinct sources supporting this value
}

export interface AttributeView {
  attribute: GrammarAttribute;
  label: string;
  readings: AttributeReading[]; // sorted by authority desc; [0] is the lead
  conflict: boolean; // more than one distinct value across sources
}

const ATTRIBUTE_LABEL: Record<GrammarAttribute, string> = {
  pos: "Part of speech",
  gender: "Gender",
  number: "Number",
  gram_case: "Case",
};

const ATTRIBUTE_ORDER: GrammarAttribute[] = ["pos", "gender", "number", "gram_case"];

/**
 * Maps an internal confidence (0..1) to a qualitative band. We deliberately do
 * NOT show the number — it implies a precision the rule engine doesn't have — but
 * still signal relative strength. Returns null when there is no confidence (a
 * cited fact isn't a probabilistic guess).
 */
export function confidenceBand(confidence: number | null | undefined): string | null {
  if (typeof confidence !== "number") return null;
  if (confidence >= 0.85) return "Very high";
  if (confidence >= 0.7) return "High";
  if (confidence >= 0.55) return "Moderate";
  if (confidence >= 0.4) return "Low";
  return "Very low";
}

// Decompose one stored row into the per-attribute facts it actually asserts,
// attributing each to its true source (POS≠case provenance within a rule row).
interface Fact {
  attribute: GrammarAttribute;
  value: string;
  att: Attestation;
}

function rowToFacts(g: WordGrammarWithRule): Fact[] {
  const facts: Fact[] = [];
  const sourced = g.provenance === "imported"; // read from a cited scholar
  const rule = g.grammar_rules;

  const scholarAtt = (): Attestation => ({
    sourceKind: "scholar",
    sourceLabel: "Sahib Singh's Darpan pad-arth",
    citation: rule?.citation ?? null,
    explanation: rule?.explanation ?? null,
    verified: rule?.verified ?? true,
    confidenceLabel: null,
    lineId: g.source_line_id ?? null,
    ruleCode: g.rule_code ?? null,
  });

  // POS — for a rule-derived row this comes from Mahan Kosh (or inheritance),
  // NOT from the row's case rule_code, so attribute it accordingly.
  if (g.pos) {
    if (sourced) {
      facts.push({ attribute: "pos", value: g.pos, att: scholarAtt() });
    } else {
      const inherited = (g.notes ?? "").includes("inherited from lemma");
      facts.push({
        attribute: "pos",
        value: g.pos,
        att: inherited
          ? {
              sourceKind: "heuristic",
              sourceLabel: "Inherited from a related form",
              citation: null,
              explanation: "Part of speech carried over from a form sharing this word's stem.",
              verified: false,
              confidenceLabel: confidenceBand(g.confidence),
              lineId: null,
              ruleCode: null,
            }
          : {
              sourceKind: "dictionary",
              sourceLabel: "Mahan Kosh marker",
              citation: "Bhai Kahn Singh Nabha, Mahan Kosh",
              explanation: "Read from the part-of-speech marker that opens the Mahan Kosh sense.",
              verified: true,
              confidenceLabel: null,
              lineId: null,
              ruleCode: null,
            },
      });
    }
  }

  // Gender / number / case — from the scholar (sourced) or from the Viakaran rule.
  const ruleAtt = (): Attestation => ({
    sourceKind: "rule",
    sourceLabel: rule?.title ?? "Viakaran rule",
    citation: rule?.citation ?? null,
    explanation: rule?.explanation ?? null,
    verified: rule?.verified ?? false,
    confidenceLabel: confidenceBand(g.confidence),
    lineId: null,
    ruleCode: g.rule_code ?? null,
  });

  for (const attribute of ["gender", "number", "gram_case"] as const) {
    const value = g[attribute];
    if (!value) continue;
    facts.push({ attribute, value, att: sourced ? scholarAtt() : ruleAtt() });
  }

  return facts;
}

function authorityOf(r: AttributeReading): number {
  return Math.max(...r.attestations.map((a) => AUTHORITY[a.sourceKind]));
}

/**
 * Builds the grouped, provenance-aware grammar view for one word's rows.
 * Attributes with no asserted value are omitted; attributes appear in a stable
 * order (POS, Gender, Number, Case).
 */
export function buildGrammarView(rows: WordGrammarWithRule[]): AttributeView[] {
  // attribute → value → attestations (deduped per source kind + rule code)
  const byAttr = new Map<GrammarAttribute, Map<string, Attestation[]>>();

  for (const row of rows) {
    for (const f of rowToFacts(row)) {
      let values = byAttr.get(f.attribute);
      if (!values) byAttr.set(f.attribute, (values = new Map()));
      const list = values.get(f.value) ?? [];
      const dupe = list.some(
        (a) => a.sourceKind === f.att.sourceKind && a.ruleCode === f.att.ruleCode,
      );
      if (!dupe) list.push(f.att);
      values.set(f.value, list);
    }
  }

  const views: AttributeView[] = [];
  for (const attribute of ATTRIBUTE_ORDER) {
    const values = byAttr.get(attribute);
    if (!values || values.size === 0) continue;

    const readings: AttributeReading[] = Array.from(values.entries()).map(([value, attestations]) => ({
      value,
      attestations: attestations.sort((a, b) => AUTHORITY[b.sourceKind] - AUTHORITY[a.sourceKind]),
    }));
    // Lead = highest-authority value; tiebreak by number of corroborating sources.
    readings.sort((a, b) => authorityOf(b) - authorityOf(a) || b.attestations.length - a.attestations.length);

    views.push({
      attribute,
      label: ATTRIBUTE_LABEL[attribute],
      readings,
      conflict: readings.length > 1,
    });
  }

  return views;
}
