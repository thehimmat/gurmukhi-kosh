// Planning the Shackle form links (#18): parsed inflections -> corpus words ->
// lexeme hubs and word_forms rows. Pure; the ingest only writes what this plans.

import { describe, expect, it } from "vitest";
import { planFormLinks, type ShackleEntry } from "../pipeline/shackle/form-links";

// A closed corpus: only these surface forms exist.
const corpus = new Map(
  [
    ["ਹੋਇ", 10], ["ਹੋਵੈ", 11], ["ਹੋਈ", 12], ["ਹੋਵਈ", 13], ["ਹੋਆ", 14], ["ਹੋਤੋ", 15],
    ["ਜੀਉ", 20], ["ਜੀਅ", 21], ["ਜੀਆਂ", 22],
    ["ਰਾਜਾ", 30], ["ਰਾਜੇ", 31], ["ਰਾਜਾਨੁ", 32],
    ["ਪਾਇ", 40], ["ਪਾਵੈ", 41], ["ਪਾਈ", 42], ["ਪਾਇਅਨੁ", 43],
  ].map(([g, id]) => [g as string, id as number])
);

const entry = (p: Partial<ShackleEntry> & Pick<ShackleEntry, "definitionId" | "wordId" | "headword" | "notes">): ShackleEntry => ({
  senseNumber: 1,
  ...p,
});

const HOI = entry({
  definitionId: 100,
  wordId: 10,
  headword: "ਹੋਇ",
  notes: "inflections: (pres. ptc. hotaü, -o; pp. hoā; pres. 3s. hoi, -ī, hovai, -aī) | shackle-freq: 800",
});
const JIU = entry({
  definitionId: 200,
  wordId: 20,
  headword: "ਜੀਉ",
  senseNumber: 2,
  notes: "inflections: (so., pd. jīa; sl. jīi, jīai; sa. jīaṁhu; po. jīāṁ) | shackle-freq: 160",
});
const RAJA = entry({ definitionId: 300, wordId: 30, headword: "ਰਾਜਾ", notes: "inflections: (pd. -e; pd., po. rājānaʳ, -uʳ) | shackle-freq: 49" });
const PAI_1 = entry({ definitionId: 401, wordId: 40, headword: "ਪਾਇ", notes: "inflections: (pres. 3s. pāvai; fsd. pāī²) | shackle-freq: 300" });
const PAI_3 = entry({
  definitionId: 403,
  wordId: 40,
  headword: "ਪਾਇ",
  senseNumber: 3,
  notes: "inflections: (infl. as PĀI¹: pp. mpd. + 3s. suf. pāianu DO49) | usage: (int. + choḍi) | shackle-freq: c.150",
});

const rowsFor = (plan: ReturnType<typeof planFormLinks>, headword: string) =>
  plan.forms.filter((f) => f.headword === headword);

describe("planFormLinks", () => {
  it("roots one lexeme hub per headword word, citing Shackle's headword", () => {
    const plan = planFormLinks([HOI, JIU, PAI_1, PAI_3], corpus);
    expect(plan.lexemes.map((l) => [l.rootWordId, l.headword])).toEqual([
      [10, "ਹੋਇ"],
      [20, "ਜੀਉ"],
      [40, "ਪਾਇ"],
    ]);
    expect(plan.lexemes.find((l) => l.rootWordId === 40)!.citationNotes).toBe("definition 403: infl. as PĀI¹");
  });

  it("links only forms whose Gurmukhi is an existing corpus word", () => {
    const plan = planFormLinks([HOI], corpus);
    const linked = rowsFor(plan, "ਹੋਇ").map((f) => [f.wordId, f.label_raw]);
    expect(linked).toEqual([
      [10, null], // the headword itself, as the citation form
      [15, "pres. ptc."], // hoto -> ਹੋਤੋ; hotaü -> ਹੋਤਉ is not in the corpus
      [14, "pp."],
      [10, "pres. 3s."], // hoi: the headword read as a form
      [12, "pres. 3s."],
      [11, "pres. 3s."],
      [13, "pres. 3s."],
    ]);
    expect(plan.stats.unresolved).toBe(1);
  });

  it("maps tags to 023 columns and keeps the verbatim label", () => {
    const plan = planFormLinks([HOI], corpus);
    const hovai = rowsFor(plan, "ਹੋਇ").find((f) => f.wordId === 11)!;
    expect(hovai).toMatchObject({
      label_raw: "pres. 3s.",
      tense_mood: "present",
      person: "third",
      number: "singular",
      gram_case: null,
      verb_form: null,
    });
    expect(hovai.features).toMatchObject({ form_roman: "hovai", definition_id: 100, shackle_tags: ["pres.", "3s."] });
  });

  it("numbers readings per membership, so one form can carry several", () => {
    const plan = planFormLinks([JIU], corpus);
    const jia = rowsFor(plan, "ਜੀਉ").filter((f) => f.wordId === 21);
    expect(jia.map((f) => [f.reading_number, f.label_raw, f.gram_case, f.number])).toEqual([
      [1, "so.", "oblique", "singular"],
      [2, "pd.", "direct", "plural"],
    ]);
    const root = rowsFor(plan, "ਜੀਉ").filter((f) => f.wordId === 20);
    expect(root.map((f) => f.reading_number)).toEqual([1]);
  });

  it("expands a leading suffix from the headword and keeps context marks", () => {
    const plan = planFormLinks([RAJA], corpus);
    const rows = rowsFor(plan, "ਰਾਜਾ");
    expect(rows.map((f) => [f.wordId, f.label_raw])).toEqual([
      [30, null],
      [31, "pd."],
      [32, "pd."],
      [32, "po."],
    ]);
    expect(rows.find((f) => f.wordId === 32)!.features.context).toEqual(["r"]);
  });

  it("puts homograph entries' forms in one hub, each tagged with its definition", () => {
    const plan = planFormLinks([PAI_1, PAI_3], corpus);
    const rows = rowsFor(plan, "ਪਾਇ");
    expect(rows.map((f) => [f.wordId, f.reading_number, f.features.definition_id ?? null])).toEqual([
      [40, 1, null],
      [41, 1, 401],
      [42, 1, 401],
      [43, 1, 403],
    ]);
    expect(rows.find((f) => f.wordId === 43)).toMatchObject({
      label_raw: "pp. mpd. + 3s. suf.",
      verb_form: "past_participle",
      features: { pronominal_suffix: "3s.", citations: ["DO49"] },
    });
  });

  it("creates no hub for an entry with no note or no attested form", () => {
    const plan = planFormLinks(
      [
        entry({ definitionId: 1, wordId: 20, headword: "ਜੀਉ", notes: "usage: freq. as honorific suf. | shackle-freq: 210" }),
        entry({ definitionId: 2, wordId: 999, headword: "ਹੂਤਾ", notes: "inflections: (-u)" }),
      ],
      corpus
    );
    expect(plan.lexemes).toEqual([]);
    expect(plan.forms).toEqual([]);
  });

  it("roots a hub on an off-corpus headword when its forms are attested", () => {
    // Shackle's lemma need not occur in the corpus; its forms must.
    const plan = planFormLinks([entry({ definitionId: 3, wordId: 999, headword: "ਹੂਤਾ", notes: "inflections: (hoi)" })], corpus);
    expect(plan.forms.map((f) => [f.rootWordId, f.wordId])).toEqual([
      [999, 999],
      [999, 10],
    ]);
  });

  it("never treats an unwritten nasal as the same word (lossless spellings only)", () => {
    // sāṁ may be printed ਸਾੰ or ਸਾਂ, but ਸਾ is a different word.
    const lex = new Map([["ਸਾਂਈ", 1], ["ਸਾ", 2]]);
    const plan = planFormLinks([entry({ definitionId: 5, wordId: 1, headword: "ਸਾਂਈ", notes: "inflections: (sāṁ)" })], lex);
    expect(plan.forms).toEqual([]);
    expect(plan.stats.lossyOnly).toBe(1);
  });
});
