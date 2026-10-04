import { describe, it, expect } from "vitest";
import { buildGrammarView, normalizePos, posMappingsFrom } from "../lib/grammar-view";
import type { WordGrammarWithRule } from "../lib/supabase";

// Minimal row factory; only the fields buildGrammarView reads matter. The
// default is a Mahan Kosh part-of-speech row, the one non-scholar row the
// grammar pipeline still writes.
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
    source_code: "mahan_kosh",
    source_line_id: null,
    provenance: "scraped",
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

// A row shaped like the retired Viakaran ending rules wrote (#21/#27/#117):
// no source, values inferred from the word's spelling.
const inferred = (p: Partial<WordGrammarWithRule>) =>
  row({ provenance: "rule_derived", source_code: null, confidence: 0.85, ...p });

describe("buildGrammarView: only values a source states are shown", () => {
  it("shows nothing from a row inferred by an ending rule, even a verified one", () => {
    const view = buildGrammarView([
      inferred({
        pos: "pronoun",
        gender: "masculine",
        number: "singular",
        gram_case: "direct",
        rule_code: "AUNKAR_NOM_SG",
        grammar_rules: rule({ rule_code: "AUNKAR_NOM_SG", verified: true }),
      }),
    ]);
    expect(view).toEqual([]);
  });

  it("shows nothing from a POS carried over from a similarly spelled word", () => {
    const view = buildGrammarView([inferred({ pos: "noun", confidence: 0.6, notes: "POS inherited from lemma ਹੁਕਮ." })]);
    expect(view).toEqual([]);
  });

  it("takes only POS from a Mahan Kosh row; it states no case, number or gender", () => {
    const view = buildGrammarView([row({ pos: "noun", gram_case: "oblique", number: "singular" })]);
    expect(view.map((v) => v.attribute)).toEqual(["pos"]);
    const att = view[0].readings[0].attestations[0];
    expect(att.sourceKind).toBe("dictionary");
    expect(att.sourceLabel).toBe("Mahan Kosh marker");
    expect(att.verified).toBe(true);
  });

  it("an inferred reading never conflicts with a scholar (ਤਿਨ: pad-arth plural stands alone)", () => {
    const view = buildGrammarView([
      row({
        provenance: "imported",
        number: "plural",
        source_code: "ss_padarth",
        source_line_id: 300,
        rule_code: "SS_PADARTH_NUMBER",
        grammar_rules: rule({ rule_code: "SS_PADARTH_NUMBER", tier: "source_extraction", verified: true }),
      }),
      inferred({ number: "singular", rule_code: "MUKTA_OBL_SG", grammar_rules: rule({ rule_code: "MUKTA_OBL_SG" }) }),
    ]);
    const number = view.find((v) => v.attribute === "number")!;
    expect(number.readings).toHaveLength(1);
    expect(number.readings[0].value).toBe("plural");
    expect(number.readings[0].attestations).toHaveLength(1);
    expect(number.conflict).toBe(false);
  });

  it("an inferred reading does not count as corroboration (ਵੀਚਾਰੁ masculine)", () => {
    const view = buildGrammarView([
      row({
        provenance: "imported",
        gender: "masculine",
        source_code: "ss_padarth",
        rule_code: "SS_PADARTH_GENDER",
        grammar_rules: rule({ rule_code: "SS_PADARTH_GENDER", tier: "source_extraction", verified: true }),
      }),
      inferred({ gender: "masculine", rule_code: "AUNKAR_NOM_SG", grammar_rules: rule({ rule_code: "AUNKAR_NOM_SG", verified: true }) }),
    ]);
    const gender = view.find((v) => v.attribute === "gender")!;
    expect(gender.readings[0].attestations).toHaveLength(1);
    expect(gender.readings[0].attestations[0].sourceKind).toBe("scholar");
  });
});

describe("buildGrammarView", () => {
  it("a scholar-vs-Mahan Kosh disagreement is a conflict led by the scholar (ਕੋਟਿ)", () => {
    const view = buildGrammarView([
      row({
        provenance: "imported",
        source_code: "ss_padarth",
        pos: "adjective",
        rule_code: "SS_PADARTH_POS",
        grammar_rules: rule({ rule_code: "SS_PADARTH_POS", tier: "source_extraction", verified: true }),
      }),
      row({ pos: "noun" }),
    ]);
    const pos = view.find((v) => v.attribute === "pos")!;
    expect(pos.conflict).toBe(true);
    expect(pos.polysemy).toBe(false);
    expect(pos.readings[0].value).toBe("adjective");
    expect(pos.readings[0].attestations[0].sourceKind).toBe("scholar");
    expect(pos.readings.find((r) => r.value === "noun")!.attestations[0].sourceKind).toBe("dictionary");
  });

  it("treats Mahan Kosh listing several POS as polysemy, not a conflict (ਇਕ noun/adjective)", () => {
    const view = buildGrammarView([row({ pos: "noun" }), row({ pos: "adjective" })]);
    const pos = view.find((v) => v.attribute === "pos")!;
    expect(pos.polysemy).toBe(true);
    expect(pos.conflict).toBe(false);
    expect(pos.readings).toHaveLength(2);
  });

  it("omits attributes with no asserted value and orders POS→Gender→Number→Case", () => {
    const view = buildGrammarView([
      row({ provenance: "imported", source_code: "shackle", gram_case: "direct", gender: "masculine" }),
    ]);
    expect(view.map((v) => v.attribute)).toEqual(["gender", "gram_case"]);
  });

  // Every imported row must be attributed to the source it actually came from.
  // Shackle rows carry no rule_code, so an attribution keyed on provenance alone
  // silently credited all 7,018 of them to Sahib Singh's pad-arth.
  it("attributes an imported row to its own source, not a hard-coded scholar", () => {
    const view = buildGrammarView([
      row({ provenance: "imported", gender: "feminine", source_code: "shackle" }),
    ]);
    const att = view.find((v) => v.attribute === "gender")!.readings[0].attestations[0];
    expect(att.sourceLabel).toBe("Shackle, A Guru Nanak Glossary");
    expect(att.citation).toContain("Christopher Shackle");
  });

  it("does not attribute an unrecognised imported source to a named scholar", () => {
    const view = buildGrammarView([
      row({ provenance: "imported", gender: "feminine", source_code: null }),
    ]);
    const att = view.find((v) => v.attribute === "gender")!.readings[0].attestations[0];
    expect(att.sourceLabel).toBe("Cited source (unattributed)");
    expect(att.sourceLabel).not.toContain("Sahib Singh");
  });

  // Two scholars are both sourceKind "scholar", so keying conflict detection on
  // kind reported a real disagreement between them as mere polysemy.
  it("reports two scholars disagreeing as a conflict, not polysemy", () => {
    const view = buildGrammarView([
      row({ provenance: "imported", gender: "feminine", source_code: "shackle" }),
      row({ provenance: "imported", gender: "masculine", source_code: "ss_padarth", grammar_rules: rule({ rule_code: "SS_PADARTH_GENDER", verified: true }) }),
    ]);
    const gender = view.find((v) => v.attribute === "gender")!;
    expect(gender.readings).toHaveLength(2);
    expect(gender.conflict).toBe(true);
    expect(gender.polysemy).toBe(false);
  });

  it("counts two scholars agreeing as genuine corroboration", () => {
    const view = buildGrammarView([
      row({ provenance: "imported", gender: "feminine", source_code: "shackle" }),
      row({ provenance: "imported", gender: "feminine", source_code: "ss_padarth", grammar_rules: rule({ rule_code: "SS_PADARTH_GENDER", verified: true }) }),
    ]);
    const gender = view.find((v) => v.attribute === "gender")!;
    expect(gender.readings).toHaveLength(1);
    expect(gender.readings[0].attestations).toHaveLength(2);
    expect(gender.conflict).toBe(false);
    expect(gender.polysemy).toBe(false);
  });

  it("still treats one source listing several values as polysemy", () => {
    const view = buildGrammarView([
      row({ provenance: "imported", pos: "noun", source_code: "shackle" }),
      row({ provenance: "imported", pos: "adjective", source_code: "shackle" }),
    ]);
    const pos = view.find((v) => v.attribute === "pos")!;
    expect(pos.polysemy).toBe(true);
    expect(pos.conflict).toBe(false);
  });
});

// Issue #29: raw source POS strings are normalized through pos_mappings before
// comparison, so sources that agree stop reading as a conflict.
describe("POS normalization (#29)", () => {
  const posMap = posMappingsFrom([
    { source_code: "shackle", pos_raw: "masculine, masculine noun", pos_norm: "noun" },
    { source_code: "shackle", pos_raw: "adjective, adjectival", pos_norm: "adjective" },
    { source_code: "shackle", pos_raw: "pronoun", pos_norm: "pronoun" },
    { source_code: "shackle", pos_raw: "adverb, adverbial", pos_norm: "adverb" },
  ]);

  it("normalizePos maps a raw label through the row's own source", () => {
    expect(normalizePos("shackle", "masculine, masculine noun", posMap)).toEqual(["noun"]);
    // The map is per source: another source's identical string is untouched.
    expect(normalizePos("ss_padarth", "masculine, masculine noun", posMap)).toEqual(["masculine, masculine noun"]);
  });

  it("normalizePos splits a compound label into one POS per part", () => {
    expect(normalizePos("shackle", "adjective, adjectival; masculine, masculine noun", posMap)).toEqual([
      "adjective",
      "noun",
    ]);
  });

  it("normalizePos drops feature labels that qualify another POS", () => {
    expect(normalizePos("shackle", "possessive; pronoun", posMap)).toEqual(["pronoun"]);
    expect(normalizePos("shackle", "negative; adverb, adverbial", posMap)).toEqual(["adverb"]);
  });

  it("normalizePos keeps an unmapped label raw rather than guessing", () => {
    expect(normalizePos("shackle", "possessive", posMap)).toEqual(["possessive"]);
    expect(normalizePos("shackle", "something new", posMap)).toEqual(["something new"]);
  });

  it("normalizePos dedupes parts that map to the same POS", () => {
    expect(normalizePos("shackle", "masculine, masculine noun; masculine, masculine noun", posMap)).toEqual(["noun"]);
  });

  it("Shackle 'masculine, masculine noun' corroborates Mahan Kosh 'noun' instead of conflicting (ਮਲੁ)", () => {
    const view = buildGrammarView(
      [
        row({ provenance: "imported", source_code: "shackle", pos: "masculine, masculine noun" }),
        row({ pos: "noun" }),
      ],
      posMap
    );
    const pos = view.find((v) => v.attribute === "pos")!;
    expect(pos.readings).toHaveLength(1);
    expect(pos.readings[0].value).toBe("noun");
    expect(pos.readings[0].attestations).toHaveLength(2);
    expect(pos.conflict).toBe(false);
    expect(pos.polysemy).toBe(false);
  });

  it("a compound Shackle label is polysemy within one source, not a conflict", () => {
    const view = buildGrammarView(
      [row({ provenance: "imported", source_code: "shackle", pos: "adjective, adjectival; masculine, masculine noun" })],
      posMap
    );
    const pos = view.find((v) => v.attribute === "pos")!;
    expect(pos.readings.map((r) => r.value).sort()).toEqual(["adjective", "noun"]);
    expect(pos.conflict).toBe(false);
    expect(pos.polysemy).toBe(true);
  });

  it("keeps the source's verbatim label on the attestation when it was normalized", () => {
    const view = buildGrammarView(
      [row({ provenance: "imported", source_code: "shackle", pos: "masculine, masculine noun" })],
      posMap
    );
    const att = view.find((v) => v.attribute === "pos")!.readings[0].attestations[0];
    expect(att.rawLabel).toBe("masculine, masculine noun");
  });

  it("carries no raw label when the stored value is already normalized", () => {
    const view = buildGrammarView([row({ pos: "noun" })], posMap);
    expect(view.find((v) => v.attribute === "pos")!.readings[0].attestations[0].rawLabel).toBeNull();
  });

  it("still flags a genuine disagreement after normalization", () => {
    const view = buildGrammarView(
      [
        row({ provenance: "imported", source_code: "shackle", pos: "adjective, adjectival" }),
        row({ pos: "noun" }),
      ],
      posMap
    );
    expect(view.find((v) => v.attribute === "pos")!.conflict).toBe(true);
  });
});
