// Parser for Shackle's `inflections: (...)` notes (#18). Fixtures are copied
// verbatim from definitions.notes (dict_source 'shackle').

import { describe, expect, it } from "vitest";
import {
  expandSuffix,
  extractInflectionsRaw,
  featureColumns,
  parseInflections,
  type ParsedForm,
} from "../pipeline/shackle/inflections";

const HOI =
  "(pres. ptc. hotaü, -o, mpd. hūte Ml3, hoṁdā; pp. hoā, hoiā, also hūā, bhaīā; pres. 3s. hoi, -ī, hovai, -aī, -asi, -ī, 3p. hoṁhi, -ī, hoṇhi, hovaṁhi, -ī, hovanhi, -ī; fut. 3s. hosī, hogu, also hoisī, hoigā, hoibā [as pres. Pr8], f. hoga, hovagi)";
const SABHU =
  "(emph. -o; fsd. sabbha, emph. -ā; infl. as adj. with sabbha throughout, or as pr. with so. sabbhasu, -asai, -asaiṁ RaA4; sl. sabhatai; pd. sabbhi, emph. -e; po. sabbhanāṁ, ext. -anāṁha; pl. sabbhanīṁ)";
const JIU = "(so., pd. jīa; sl. jīi, jīai; sa. jīaṁhu; po. jīāṁ)";
const RAJA = "(pd. -e; pd., po. rājānaʳ, -uʳ)";
const PAI_1 =
  "(inf. pāvaṇu; pres. ptc. pāṁidā; pp. msd. pāiā, -o, ext. -arā, fsd. pāī², pāiā, mpd. pāe; pres. 1s. pāvaüṁ, -āṁ, 2s. pāvaṁhi, pāvasitā Ga15ʳ, 3s. pāvai, -asi, also pāe, -ī³, 3p. pāinhi, pāvaṁhi; fut. 3s. pāisī, pāvasī; pass. pres. 3s. pāīai)";
const PAI_3 = "(infl. as PĀI¹: pp. mpd. + 3s. suf. pāianu DO49)";
const PAI_5 = "(-ī⁴)";
const KARI =
  "(inf. karaṇu, ger. -aṇā; pres. ptc. karatā, -u, karadā, ext. kareṁdā; pp. kīā, kītā, kīnā; pres. 1s. karaüṁ, -īṁ, ext. -euṁr, 2s. karaṁhi, -ī, ext. -eṁhir, -īr, 3s. kare, -ai, ext. -eir, eīr, 1p. karaṁha, ext. -ehāṁr, 2p. karahu, ext. -ehur, 3p. karaṁhi, -anti, -anhi, ext. -eṁhir, -enhir; imp. 2s. kari, 2p. karahu, karo, ext. karevahu, -o; fut. 3s. karasī, karegu; pres. pass. 3s. karīai, -ījai)";

const pairs = (forms: ParsedForm[]) => forms.map((f) => [f.form_roman, f.label_raw]);
const find = (forms: ParsedForm[], roman: string) => forms.filter((f) => f.form_roman === roman);

describe("extractInflectionsRaw", () => {
  it("pulls the inflections segment out of a notes string", () => {
    expect(extractInflectionsRaw(`inflections: ${JIU} | shackle-freq: 160`)).toBe(JIU);
    expect(extractInflectionsRaw(`inflections: ${PAI_5} | cross-reference-only`)).toBe(PAI_5);
  });
  it("returns null when there is no inflections segment", () => {
    expect(extractInflectionsRaw("usage: freq. as honorific suf. | shackle-freq: 210")).toBeNull();
    expect(extractInflectionsRaw(null)).toBeNull();
  });
});

describe("expandSuffix", () => {
  it.each([
    ["hovai", "-aī", "hovaī"],
    ["hoi", "-ī", "hoī"],
    ["hotaü", "-o", "hoto"],
    ["karaṇu", "-aṇā", "karaṇā"],
    ["karaüṁ", "-īṁ", "karīṁ"],
    ["rājāna", "-u", "rājānu"],
    ["rājā", "-e", "rāje"],
    ["sabbhasu", "-asai", "sabbhasai"],
    ["sabbhanāṁ", "-anāṁha", "sabbhanāṁha"],
    ["karaṁhi", "-eṁhi", "kareṁhi"],
    ["kampi", "-aṇu", "kampaṇu"],
    ["pāiā", "-o", "pāio"],
    ["karīai", "-ījai", "karījai"],
    ["hovaī", "-asi", "hovasi"],
  ])("%s + %s -> %s", (stem, suffix, out) => {
    expect(expandSuffix(suffix, stem)).toBe(out);
  });

  it("falls back to the last full form when the previous expansion has no anchor", () => {
    // 3p. karaṁhi, -anti, -anhi: -anhi is a sibling of -anti, both on karaṁhi.
    expect(expandSuffix("-anhi", "karanti", "karaṁhi")).toBe("karanhi");
  });

  it("expands a prefix form from the start of the stem", () => {
    expect(expandSuffix("pā-", "paraṇā")).toBe("pāraṇā");
    expect(expandSuffix("ā-", "agāhāṁ")).toBe("āgāhāṁ");
  });
});

describe("parseInflections: ਹੋਇ", () => {
  const { forms } = parseInflections(HOI, "hoi");

  it("expands suffix-only forms from the stem", () => {
    expect(forms.map((f) => f.form_roman)).toEqual([
      "hotaü", "hoto", "hūte", "hoṁdā",
      "hoā", "hoiā", "hūā", "bhaīā",
      "hoi", "hoī", "hovai", "hovaī", "hovasi", "hovasī",
      "hoṁhi", "hoṁhī", "hoṇhi", "hovaṁhi", "hovaṁhī", "hovanhi", "hovanhī",
      "hosī", "hogu", "hoisī", "hoigā", "hoibā", "hoga", "hovagi",
    ]);
  });

  it("carries each tag forward until the next tag", () => {
    expect(find(forms, "hoto")[0].grammar_tags).toEqual(["pres.", "ptc."]);
    expect(find(forms, "bhaīā")[0].label_raw).toBe("pp.");
    expect(find(forms, "hovasī")[0].label_raw).toBe("pres. 3s.");
    expect(find(forms, "hovanhī")[0].label_raw).toBe("pres. 3p.");
    expect(find(forms, "hovagi")[0].label_raw).toBe("fut. 3s. f.");
  });

  it("scopes a tag to its own item when that item cites a single passage", () => {
    expect(find(forms, "hūte")[0].label_raw).toBe("pres. ptc. mpd.");
    expect(find(forms, "hūte")[0].features.citations).toEqual(["Ml3"]);
    expect(find(forms, "hoṁdā")[0].label_raw).toBe("pres. ptc.");
  });

  it("keeps a bracketed note on the form before it", () => {
    expect(find(forms, "hoibā")[0].features.note).toBe("as pres. Pr8");
  });
});

describe("parseInflections: ਸਭੁ", () => {
  const { forms } = parseInflections(SABHU, "sabhu");

  it("reads emphatic, prose-introduced and segment forms", () => {
    expect(pairs(forms)).toEqual([
      ["sabho", "emph."],
      ["sabbha", "fsd."],
      ["sabbhā", "fsd. emph."],
      ["sabbhasu", "pr. so."],
      ["sabbhasai", "pr. so."],
      ["sabbhasaiṁ", "pr. so."],
      ["sabhatai", "sl."],
      ["sabbhi", "pd."],
      ["sabbhe", "pd. emph."],
      ["sabbhanāṁ", "po."],
      ["sabbhanāṁha", "po. ext."],
      ["sabbhanīṁ", "pl."],
    ]);
  });
});

describe("parseInflections: ਜੀਉ", () => {
  it("gives one reading per alternative tag in a tag list", () => {
    const { forms } = parseInflections(JIU, "jīu");
    expect(pairs(forms)).toEqual([
      ["jīa", "so."],
      ["jīa", "pd."],
      ["jīi", "sl."],
      ["jīai", "sl."],
      ["jīaṁhu", "sa."],
      ["jīāṁ", "po."],
    ]);
  });
});

describe("parseInflections: ਰਾਜਾ", () => {
  const { forms } = parseInflections(RAJA, "rājā");

  it("expands a leading suffix from the headword", () => {
    expect(pairs(forms)).toEqual([
      ["rāje", "pd."],
      ["rājāna", "pd."],
      ["rājāna", "po."],
      ["rājānu", "pd."],
      ["rājānu", "po."],
    ]);
  });

  it("keeps superscript context marks in features", () => {
    expect(find(forms, "rājāna")[0].features.context).toEqual(["r"]);
    expect(find(forms, "rājānu")[0].features.context).toEqual(["r"]);
    expect(find(forms, "rāje")[0].features.context).toBeUndefined();
  });
});

describe("parseInflections: ਪਾਇ homographs", () => {
  it("entry 1: tags, homograph marks, citations", () => {
    const { forms } = parseInflections(PAI_1, "pāi");
    expect(find(forms, "pāio")[0].label_raw).toBe("pp. msd.");
    expect(find(forms, "pāī")[0].features.homograph).toBe(2);
    expect(find(forms, "pāvasitā")[0].features).toMatchObject({ citations: ["Ga15"], context: ["r"] });
    expect(find(forms, "pāvāṁ")[0].label_raw).toBe("pres. 1s.");
    expect(find(forms, "pāīai")[0].label_raw).toBe("pass. pres. 3s.");
  });

  it("entry 3: records the 'infl. as' pointer and a pronominal suffix", () => {
    const { forms, inflectsAs } = parseInflections(PAI_3, "pāi");
    expect(inflectsAs).toBe("PĀI¹");
    expect(forms).toHaveLength(1);
    expect(forms[0]).toMatchObject({
      form_roman: "pāianu",
      label_raw: "pp. mpd. + 3s. suf.",
      grammar_tags: ["pp.", "mpd."],
    });
    expect(forms[0].features).toMatchObject({ pronominal_suffix: "3s.", citations: ["DO49"] });
  });

  it("entry 5: a lone suffix with a homograph mark", () => {
    const { forms } = parseInflections(PAI_5, "pāi");
    expect(forms).toEqual([
      { form_roman: "pāī", grammar_tags: [], label_raw: null, features: { homograph: 4 } },
    ]);
  });
});

describe("parseInflections: ਕਰਿ", () => {
  const { forms } = parseInflections(KARI, "kari");
  const romans = forms.map((f) => f.form_roman);

  it("expands sibling suffixes and degraded rhyme marks", () => {
    expect(romans).toEqual(
      expect.arrayContaining(["karaṇā", "karatu", "karīṁ", "kareuṁ", "kareṁhi", "karai", "karei",
        "karanti", "karanhi", "karenhi", "karījai"])
    );
    expect(find(forms, "kareuṁ")[0].features.context).toEqual(["r"]);
    expect(find(forms, "kareuṁ")[0].label_raw).toBe("pres. 1s. ext.");
    expect(find(forms, "karai")[0].label_raw).toBe("pres. 3s.");
    expect(find(forms, "karo")[0].label_raw).toBe("imp. 2p.");
    expect(find(forms, "karevahu")[0].label_raw).toBe("imp. 2p. ext.");
  });
});

describe("parseInflections: edge shapes", () => {
  it("skips hypothetical (*) forms and 'of' references", () => {
    expect(parseInflections("(so., pd. of *siu)", "siva").forms).toEqual([]);
    expect(parseInflections("(-ai, so. of *hiuṁ)", "hiṁva").forms.map((f) => f.form_roman)).toEqual(["hiṁvai"]);
  });

  it("flags forms not in Guru Nanak and doubtful tags", () => {
    const { forms } = parseInflections("(pres. ptc. mpo. †turandiāṁ AsF2)", "tori");
    expect(forms[0]).toMatchObject({ form_roman: "turandiāṁ", features: { not_in_guru_nanak: true } });
    const doubt = parseInflections("(pp. fs.? + 1s. suf. ghoṭima Su3)", "ghoṭi").forms[0];
    expect(doubt.label_raw).toBe("pp. fs.? + 1s. suf.");
    expect(doubt.features.doubtful).toBe(true);
  });

  it("keeps a cited item's tags when they start a new set rather than refine one", () => {
    const { forms } = parseInflections("(pp. suttā, sūtā; pres. 3p. savanhi AsV24.1, savandhi MrA9ᵈ)", "savi");
    expect(find(forms, "savandhi")[0].label_raw).toBe("pres. 3p.");
    expect(find(forms, "savandhi")[0].features.context).toEqual(["d"]);
  });

  it("re-expands from the last full form when a suffix would repeat the previous form", () => {
    const { forms } = parseInflections("(pp. -iā, -ā)", "pachāni");
    expect(forms.map((f) => f.form_roman)).toEqual(["pachāniā", "pachānā"]);
  });

  it("reads a flattened rhyme mark after a homograph digit", () => {
    expect(parseInflections("(-āī²r)", "kamāī").forms[0]).toMatchObject({
      form_roman: "kamāī",
      features: { homograph: 2, context: ["r"] },
    });
  });

  it("skips English prose words and consonant-final OCR fragments", () => {
    expect(parseInflections("(sl. also -a, rarely -i)", "daragaha").forms.map((f) => [f.form_roman, f.label_raw])).toEqual([
      ["daragaha", "sl."],
      ["daragahi", "sl."],
    ]);
    expect(parseInflections("(s. genitive -asya SlS2ˢ)", "saṁsāru").forms.map((f) => f.form_roman)).toEqual(["saṁsārasya"]);
    expect(parseInflections("(miragal)", "miragu").forms).toEqual([]);
  });

  it("ends the group at a usage note, so its words are never read as forms", () => {
    expect(parseInflections("(int. + le, lai)", "kāḍhi").forms).toEqual([]);
    expect(parseInflections("(+ kari, karai; pp. matā)", "matā").forms.map((f) => f.form_roman)).toEqual(["matā"]);
  });

  it("reads a bare variant spelling after 'or'", () => {
    expect(parseInflections("(or ārhaṇu)", "āraṇu").forms.map((f) => f.form_roman)).toEqual(["ārhaṇu"]);
  });
});

describe("featureColumns", () => {
  it.each([
    [["pres.", "3s."], { tense_mood: "present", person: "third", number: "singular" }],
    [["pres.", "ptc."], { verb_form: "present_participle" }],
    [["pp.", "mpd."], { verb_form: "past_participle", gender: "masculine", number: "plural", gram_case: "direct" }],
    [["fut.", "3s.", "f."], { tense_mood: "future", person: "third", number: "singular", gender: "feminine" }],
    [["pl."], { number: "plural", gram_case: "locative" }],
    [["sa."], { number: "singular", gram_case: "ablative" }],
    [["inf."], { verb_form: "infinitive" }],
    [["ger."], { verb_form: "gerundive" }],
    [["imp.", "2p."], { tense_mood: "imperative", person: "second", number: "plural" }],
    [["fs.?"], { gender: "feminine", number: "singular" }],
  ])("%j", (tags, cols) => {
    expect(featureColumns(tags)).toMatchObject(cols);
  });

  it("leaves unmapped columns null and puts voice/emphasis in extra features", () => {
    const c = featureColumns(["pass.", "pres.", "3s."]);
    expect(c.gram_case).toBeNull();
    expect(c.extra).toEqual({ voice: "passive" });
    expect(featureColumns(["pd.", "emph."]).extra).toEqual({ emphatic: true });
  });
});
