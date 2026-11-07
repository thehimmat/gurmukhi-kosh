/**
 * Shackle's phrases (#163): the compounds and the glossed phrases in the usage notes of his
 * glossary, in his romanisation, parsed into phrase + gloss with candidate Gurmukhi spellings per
 * word for matching against a line. Fixtures are real entries (pipeline/shackle/data, gitignored).
 * Run: npm test
 */
import { describe, it, expect } from "vitest";
import { compoundPhrases, planCollocations, usagePhrases } from "../pipeline/shackle/collocations";
import type { GlossaryEntry } from "../pipeline/shackle/types";

describe("compoundPhrases", () => {
  it("reads a two-word compound", () => {
    expect(compoundPhrases("ammrita velā")).toEqual(["ammrita velā"]);
  });

  it("drops an inflection note in brackets", () => {
    expect(compoundPhrases("asaṭa sidhi (-īṁ)")).toEqual(["asaṭa sidhi"]);
    expect(compoundPhrases("sati sarūpu (-a)")).toEqual(["sati sarūpu"]);
  });

  it("splits alternatives, and reads an optional word both ways", () => {
    expect(compoundPhrases("santa sabhā, santāṁ (kī) saṅgati")).toEqual(["santa sabhā", "santāṁ kī saṅgati", "santāṁ saṅgati"]);
  });

  it("skips a one-word compound: it isn't a phrase on a line", () => {
    expect(compoundPhrases("satināmu")).toEqual([]);
  });
});

describe("usagePhrases", () => {
  const cases: [string, { phrase: string; gloss: string }[]][] = [
    ["mukhu ujjalu hoi 'face to be bright, i.e. be honoured, unsmirched'", [{ phrase: "mukhu ujjalu hoi", gloss: "face to be bright, i.e. be honoured, unsmirched" }]],
    [
      "uṭṭhi jāi, uṭṭhī calli 'get up and go, die, depart'",
      [
        { phrase: "uṭṭhi jāi", gloss: "get up and go, die, depart" },
        { phrase: "uṭṭhī calli", gloss: "get up and go, die, depart" },
      ],
    ],
    ["only as ita uta 'everywhere'", [{ phrase: "ita uta", gloss: "everywhere" }]],
    ["as uttaru de 'answer, account for, dismiss'", [{ phrase: "uttaru de", gloss: "answer, account for, dismiss" }]],
    ["only as thāpi uthāpi 'establish and remove, create and destroy (of God)'", [{ phrase: "thāpi uthāpi", gloss: "establish and remove, create and destroy (of God)" }]],
    [
      "in udosāhai kiā nīsānī Sl29, comm. 'what is the mark of breathlessness?'",
      [{ phrase: "udosāhai kiā nīsānī", gloss: "what is the mark of breathlessness?" }],
    ],
    ["as nadī upakaṇṭhi MlA2 'beside a river'", [{ phrase: "nadī upakaṇṭhi", gloss: "beside a river" }]],
    ["as pagga upetāṇā AsV9.2 'barefoot'", [{ phrase: "pagga upetāṇā", gloss: "barefoot" }]],
    ["ubbhe sāha MjV1.2 'panting, short of breath'", [{ phrase: "ubbhe sāha", gloss: "panting, short of breath" }]],
    ["int. ūṁco ūṁcā 'very high'", [{ phrase: "ūṁco ūṁcā", gloss: "very high" }]],
    [
      "sl. ujjhaṛi as adv. 'astray', sim. ujjhaṛa pāi² MlV16 'having caused to go astray'",
      [{ phrase: "ujjhaṛa pāi", gloss: "having caused to go astray" }],
    ],
    ["as uri dhāri, uridhāri [=URADHĀRI] 'fix in the heart'", [{ phrase: "uri dhāri", gloss: "fix in the heart" }]],
  ];
  it.each(cases)("%s", (notes, expected) => {
    expect(usagePhrases(notes)).toEqual(expected);
  });

  it.each([
    "( + kari)",
    "(int. + jāi)",
    "m. 'yogi who is detached from the world'",
    "in p. 'plants (which sprout from the earth); the vegetable kingdom'",
    "[hardly as most comm. 'at dawn, always']",
    "abs. ulaṭi also as adv. 'back, again'",
    "also ppn. 'above, on, upon': a. upparaṁhu AsA11, adv. 'from above'",
  ])("finds no phrase in %s", (notes) => {
    expect(usagePhrases(notes)).toEqual([]);
  });
});

describe("planCollocations", () => {
  const entry = (extra: Partial<GlossaryEntry>): GlossaryEntry =>
    ({ id: "e1", page: 1, gurmukhi: "ਅੰਮ੍ਰਿਤੁ", gurmukhiNormalized: "ਅੰਮ੍ਰਿਤੁ", headword: "ammritu", notInGuruNanak: false, secondMemberOnly: false, posRaw: "m.", partOfSpeech: [], gloss: "nectar", glossIsCrossRefOnly: false, flags: [], ...extra }) as GlossaryEntry;

  it("plans one row per phrase, with its gloss, origin and candidate spellings per word", () => {
    const rows = planCollocations([
      entry({
        compounds: [{ text: "ammrita velā", posRaw: "m.", gloss: "the time of nectar, the hour before dawn" }],
        usageNotes: "only as ita uta 'everywhere'",
      }),
    ]);
    expect(rows.map((r) => [r.origin, r.phraseRoman, r.gloss, r.posRaw])).toEqual([
      ["compound", "ammrita velā", "the time of nectar, the hour before dawn", "m."],
      ["usage", "ita uta", "everywhere", null],
    ]);
    expect(rows[0]).toMatchObject({ sourceEntry: "e1", headGurmukhi: "ਅੰਮ੍ਰਿਤੁ" });
    expect(rows[0].members).toHaveLength(2);
    expect(rows[0].members[1]).toContain("ਵੇਲਾ");
    expect(rows[0].phraseGurmukhi.split(" ")).toHaveLength(2);
  });

  it("keeps one row per entry and phrase, even when a note repeats it", () => {
    const rows = planCollocations([entry({ usageNotes: "ita uta 'everywhere'; also ita uta 'here and there'" })]);
    expect(rows.map((r) => r.phraseRoman)).toEqual(["ita uta"]);
  });
});
