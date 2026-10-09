// Shackle romanization <-> Gurmukhi, for linking inflected forms (#18).
//
// reverseTransliterate + candidateSpellings are a TS port of the suite's
// gurmukhi-transliterate engine (gurmukhi_transliterate/reverse.py and
// matcher.candidate_spellings, gurmukhi-transliterate#7), which
// reverse_appendix.py calls for the appendix ingest. Porting keeps the form-link
// ingest in one language and unit-testable; tests/fixtures/
// shackle-reverse-parity.json pins the port to the Python output. One addition:
// ï reads as a hiatus i (ਇ), the counterpart of ü, which the Python tokenizer
// passes through unchanged.
//
// gurmukhiToShackle is the forward direction, used only to give a headword a
// romanized stem when an inflections note opens with a suffix (`pd. -e` under
// ਰਾਜਾ). It cannot recover gemination Gurmukhi leaves unmarked (ਸਭੁ comes out
// "sabhu", Shackle prints "sabbhu"); the reverse engine collapses gemination
// anyway, so the Gurmukhi a form resolves to is the same.

const VIRAMA = "੍";
const ADDAK = "ੱ";
const TIPPI = "ੰ";
const BINDI = "ਂ";
const SUBJOINED_HA = "੍ਹ";

const UNASPIRATE_OF: Record<string, string> = {
  ਖ: "ਕ", ਘ: "ਗ", ਛ: "ਚ", ਝ: "ਜ", ਠ: "ਟ", ਢ: "ਡ", ਥ: "ਤ", ਧ: "ਦ", ਫ: "ਪ", ਭ: "ਬ",
};

type Cons = { base: string; isNasal?: boolean; aspirateSonorant?: boolean; persianCollision?: boolean };
type Vowel = { matra: string; independent: string };

// Longest romanization first for greedy matching.
const CONSONANTS: [string, Cons][] = [
  ["ṇh", { base: "ਣ", aspirateSonorant: true }],
  ["nh", { base: "ਨ", aspirateSonorant: true }],
  ["mh", { base: "ਮ", aspirateSonorant: true }],
  ["rh", { base: "ਰ", aspirateSonorant: true }],
  ["lh", { base: "ਲ", aspirateSonorant: true }],
  ["ṛh", { base: "ੜ", aspirateSonorant: true }],
  ["kh", { base: "ਖ", persianCollision: true }],
  ["gh", { base: "ਘ" }],
  ["ch", { base: "ਛ" }],
  ["jh", { base: "ਝ" }],
  ["ṭh", { base: "ਠ" }],
  ["ḍh", { base: "ਢ" }],
  ["th", { base: "ਥ" }],
  ["dh", { base: "ਧ" }],
  ["ph", { base: "ਫ" }],
  ["bh", { base: "ਭ" }],
  ["ś", { base: "ਸ਼" }],
  ["ṣ", { base: "ਸ਼" }],
  ["ġ", { base: "ਗ਼" }],
  ["z", { base: "ਜ਼" }],
  ["f", { base: "ਫ਼" }],
  ["q", { base: "ਕ਼" }],
  ["s", { base: "ਸ" }],
  ["h", { base: "ਹ" }],
  ["k", { base: "ਕ" }],
  ["g", { base: "ਗ" }],
  ["ṅ", { base: "ਙ", isNasal: true }],
  ["c", { base: "ਚ" }],
  ["j", { base: "ਜ" }],
  ["ñ", { base: "ਞ", isNasal: true }],
  ["ṭ", { base: "ਟ" }],
  ["ḍ", { base: "ਡ" }],
  ["ṇ", { base: "ਣ", isNasal: true }],
  ["t", { base: "ਤ" }],
  ["d", { base: "ਦ" }],
  ["n", { base: "ਨ", isNasal: true }],
  ["p", { base: "ਪ" }],
  ["b", { base: "ਬ" }],
  ["m", { base: "ਮ", isNasal: true }],
  ["y", { base: "ਯ" }],
  ["r", { base: "ਰ" }],
  ["l", { base: "ਲ" }],
  ["v", { base: "ਵ" }],
  ["ṛ", { base: "ੜ" }],
];

const VOWELS: [string, Vowel][] = [
  ["ā", { matra: "ਾ", independent: "ਆ" }],
  ["ī", { matra: "ੀ", independent: "ਈ" }],
  ["ū", { matra: "ੂ", independent: "ਊ" }],
  ["ai", { matra: "ੈ", independent: "ਐ" }],
  ["au", { matra: "ੌ", independent: "ਔ" }],
  ["a", { matra: "", independent: "ਅ" }],
  ["i", { matra: "ਿ", independent: "ਇ" }],
  ["u", { matra: "ੁ", independent: "ਉ" }],
  ["e", { matra: "ੇ", independent: "ਏ" }],
  ["o", { matra: "ੋ", independent: "ਓ" }],
  ["ü", { matra: "ੁ", independent: "ਉ" }],
  ["ï", { matra: "ਿ", independent: "ਇ" }],
];

const NASALIZATION = "ṁ";
const PASSTHROUGH = new Set([..." .,;:!?|'\"()[]-"]);

export type Ambiguity = {
  kind: "nasalization" | "aspirate_sonorant" | "gemination" | "persian_collision";
  source: string;
  chosen: string;
  alternatives: string[];
  start: number;
};

export type ReverseResult = { gurmukhi: string; ambiguities: Ambiguity[] };

export type Tok =
  | { kind: "C"; roman: string; cons: Cons }
  | { kind: "V"; roman: string; vowel: Vowel }
  | { kind: "N"; roman: string }
  | { kind: "?"; roman: string };

/** Greedy longest-match tokenizer over Shackle graphemes (C consonant, V vowel, N nasalization). */
export function tokenize(text: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  outer: while (i < text.length) {
    const ch = text[i];
    if (/\s/.test(ch) || PASSTHROUGH.has(ch)) {
      toks.push({ kind: "?", roman: ch });
      i++;
      continue;
    }
    for (const [rom, cons] of CONSONANTS) {
      if (text.startsWith(rom, i)) {
        toks.push({ kind: "C", roman: rom, cons });
        i += rom.length;
        continue outer;
      }
    }
    for (const [rom, vowel] of VOWELS) {
      if (text.startsWith(rom, i)) {
        toks.push({ kind: "V", roman: rom, vowel });
        i += rom.length;
        continue outer;
      }
    }
    if (text.startsWith(NASALIZATION, i)) {
      toks.push({ kind: "N", roman: NASALIZATION });
      i += NASALIZATION.length;
      continue;
    }
    toks.push({ kind: "?", roman: ch });
    i++;
  }
  return toks;
}

/** Shackle romanization -> primary Gurmukhi plus the points where it is underdetermined. */
export function reverseTransliterate(roman: string): ReverseResult {
  const toks = tokenize(roman.normalize("NFC"));
  const out: string[] = [];
  const ambiguities: Ambiguity[] = [];
  let awaitingCons = false;
  let prevConsBase: string | null = null;
  let prevConsOffset = 0;

  // Offsets are in UTF-16 code units, consistent with candidateSpellings' slicing.
  const pos = () => out.reduce((n, s) => n + s.length, 0);
  const nextNonspace = (idx: number): Tok | null => {
    for (let j = idx + 1; j < toks.length; j++) if (toks[j].kind !== "?") return toks[j];
    return null;
  };

  for (let i = 0; i < toks.length; i++) {
    const tok = toks[i];

    if (tok.kind === "?") {
      out.push(tok.roman);
      awaitingCons = false;
      prevConsBase = null;
      continue;
    }

    if (tok.kind === "N") {
      ambiguities.push({ kind: "nasalization", source: "ṁ", chosen: TIPPI, alternatives: [BINDI, ""], start: pos() });
      out.push(TIPPI);
      awaitingCons = false;
      prevConsBase = null;
      continue;
    }

    if (tok.kind === "V") {
      if (awaitingCons) {
        if (tok.vowel.matra) out.push(tok.vowel.matra);
      } else {
        out.push(tok.vowel.independent);
      }
      awaitingCons = false;
      prevConsBase = null;
      continue;
    }

    const c = tok.cons;
    const nxt = nextNonspace(i);
    const nxtCons = nxt?.kind === "C" ? nxt.cons : null;

    // 1. Gemination (§4): identical consonant, or unaspirate + its aspirate.
    if (awaitingCons && prevConsBase !== null && !c.aspirateSonorant) {
      const isIdentical = c.base === prevConsBase;
      const isAspirateGem = UNASPIRATE_OF[c.base] === prevConsBase;
      if (isIdentical || isAspirateGem) {
        if (isAspirateGem) {
          if (out.length && out[out.length - 1] === prevConsBase) out[out.length - 1] = c.base;
          else out.push(c.base);
          prevConsBase = c.base;
        }
        ambiguities.push({
          kind: "gemination",
          source: tok.roman,
          chosen: c.base,
          alternatives: [ADDAK + c.base],
          start: prevConsOffset,
        });
        continue;
      }
    }

    // 2. Homorganic nasal group: nasal + consonant -> ੰ (§5).
    if (c.isNasal && nxtCons) {
      if (nxtCons.base === c.base) {
        ambiguities.push({ kind: "gemination", source: tok.roman + tok.roman, chosen: TIPPI, alternatives: [""], start: pos() });
      }
      out.push(TIPPI);
      awaitingCons = false;
      prevConsBase = null;
      continue;
    }

    // 3. Base consonant.
    const baseOffset = pos();
    out.push(c.base);
    if (c.aspirateSonorant) {
      out.push(SUBJOINED_HA);
      ambiguities.push({
        kind: "aspirate_sonorant",
        source: tok.roman,
        chosen: c.base + SUBJOINED_HA,
        alternatives: [c.base + "ਹ", c.base],
        start: baseOffset,
      });
    } else if (c.persianCollision) {
      ambiguities.push({ kind: "persian_collision", source: tok.roman, chosen: c.base, alternatives: ["ਖ਼"], start: baseOffset });
    }

    // 4. Conjunct (§3a), unless the next consonant geminates this one.
    const geminationAhead = !!nxtCons && (nxtCons.base === c.base || UNASPIRATE_OF[nxtCons.base] === c.base);
    if (nxtCons && !c.aspirateSonorant && !geminationAhead) {
      out.push(VIRAMA);
      awaitingCons = false;
      prevConsBase = null;
    } else {
      awaitingCons = true;
      prevConsBase = c.base;
      prevConsOffset = baseOffset;
    }
  }

  return { gurmukhi: out.join(""), ambiguities };
}

const MAX_CANDIDATES = 256;

/**
 * Every Gurmukhi spelling a reverse result's ambiguity flags allow, primary
 * first (matcher.candidate_spellings). `lossless` drops the alternatives that
 * delete a mark outright (an unwritten nasalization, a bare sonorant for nh):
 * those spell a different surface word, not the same word another way. The
 * geminate-nasal collapse (§4/§5) is kept, being the same word printed with one
 * nasal.
 */
export function candidateSpellings(result: ReverseResult, opts: { lossless?: boolean } = {}): string[] {
  const base = result.gurmukhi;
  if (!result.ambiguities.length) return [base];

  const choiceSets = result.ambiguities.map((a) => {
    let alts = a.alternatives.filter((x) => x !== a.chosen);
    if (opts.lossless) {
      if (a.kind === "nasalization") alts = alts.filter((x) => x !== "");
      if (a.kind === "aspirate_sonorant") alts = alts.filter((x) => x.length > 1);
    }
    return [a.chosen, ...alts].map((opt) => ({ start: a.start, len: a.chosen.length, opt }));
  });

  const seen = new Set<string>();
  const candidates: string[] = [];
  const combo: { start: number; len: number; opt: string }[] = [];
  const walk = (depth: number): boolean => {
    if (depth === choiceSets.length) {
      let word = base;
      for (const c of [...combo].sort((a, b) => b.start - a.start)) {
        word = word.slice(0, c.start) + c.opt + word.slice(c.start + c.len);
      }
      word = word.normalize("NFC");
      if (!seen.has(word)) {
        seen.add(word);
        candidates.push(word);
      }
      return candidates.length >= MAX_CANDIDATES;
    }
    for (const choice of choiceSets[depth]) {
      combo.push(choice);
      const stop = walk(depth + 1);
      combo.pop();
      if (stop) return true;
    }
    return false;
  };
  walk(0);
  return candidates;
}

// ---------------------------------------------------------------------------
// Forward: Gurmukhi -> Shackle roman (headword stems only).
// ---------------------------------------------------------------------------

const F_CONS: Record<string, string> = {
  ਸ: "s", ਹ: "h", ਕ: "k", ਖ: "kh", ਗ: "g", ਘ: "gh", ਙ: "ṅ", ਚ: "c", ਛ: "ch", ਜ: "j", ਝ: "jh", ਞ: "ñ",
  ਟ: "ṭ", ਠ: "ṭh", ਡ: "ḍ", ਢ: "ḍh", ਣ: "ṇ", ਤ: "t", ਥ: "th", ਦ: "d", ਧ: "dh", ਨ: "n",
  ਪ: "p", ਫ: "ph", ਬ: "b", ਭ: "bh", ਮ: "m", ਯ: "y", ਰ: "r", ਲ: "l", ਵ: "v", ੜ: "ṛ",
  "ਸ਼": "ś", "ਜ਼": "z", "ਗ਼": "ġ", "ਖ਼": "kh", "ਫ਼": "f", "ਕ਼": "q",
};
const F_MATRA: Record<string, string> = {
  "ਾ": "ā", "ਿ": "i", "ੀ": "ī", "ੁ": "u", "ੂ": "ū", "ੇ": "e", "ੈ": "ai", "ੋ": "o", "ੌ": "au",
};
const F_VOWEL: Record<string, string> = {
  ਅ: "a", ਆ: "ā", ਇ: "i", ਈ: "ī", ਉ: "u", ਊ: "ū", ਏ: "e", ਐ: "ai", ਓ: "o", ਔ: "au",
};
const NUKTA = "਼";
// Nukta letters are composition exclusions, so key on the decomposed form.
const F_CONS_NFD = new Map(Object.entries(F_CONS).map(([g, r]) => [g.normalize("NFD"), r]));

/** Gurmukhi -> Shackle roman, writing the inherent -a after every unmarked consonant. */
export function gurmukhiToShackle(gurmukhi: string): string {
  const chars = [...gurmukhi.normalize("NFD")];
  let out = "";
  let afterInherentA = false;
  let double = false;
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const withNukta = chars[i + 1] === NUKTA;
    const cons = F_CONS_NFD.get(withNukta ? ch + NUKTA : ch);
    if (cons) {
      if (withNukta) i++;
      out += double ? cons[0] + cons : cons;
      double = false;
      const next = chars[i + 1];
      if (next === VIRAMA) {
        i++;
        afterInherentA = false;
        continue;
      }
      if (next && F_MATRA[next]) {
        out += F_MATRA[next];
        i++;
        afterInherentA = false;
      } else {
        out += "a";
        afterInherentA = true;
      }
      continue;
    }
    if (ch === ADDAK) {
      double = true;
      continue;
    }
    if (ch === TIPPI || ch === BINDI) {
      out += NASALIZATION;
      continue;
    }
    const v = F_VOWEL[ch];
    if (v) {
      // ਉ / ਇ straight after an a (inherent, or ਅ itself) are hiatus vowels:
      // ü / ï keep "karaü" and "aühaṭhi" from reading as the diphthongs au / ai.
      if (afterInherentA && v === "u") out += "ü";
      else if (afterInherentA && v === "i") out += "ï";
      else out += v;
      afterInherentA = v === "a";
      continue;
    }
    out += ch;
    afterInherentA = false;
  }
  return out.normalize("NFC");
}
