// Parse Shackle's `inflections: (...)` notes into forms with their grammar
// tags (#18). Pure: no database, no Gurmukhi. The ingest (form-links.ts)
// reverse-transliterates each form and keeps only those the corpus attests.
//
// Shackle's shorthand (A Guru Nanak Glossary, pp. xxvii-xxx; the handoff's
// SIGNS-AND-ABBREVIATIONS.md):
//   - `;` and `:` separate groups; tags reset at each group.
//   - A tag applies to the forms after it until a tag of the same or an outer
//     kind replaces it: `pres. 3s. hoi, hovai, 3p. hoṁhi` keeps `pres.` and
//     swaps `3s.` for `3p.`.
//   - A tag-only item before another tagged item lists alternatives:
//     `so., pd. jīa` reads jīa as both singular oblique and plural direct.
//   - `-X` is a form written as its ending, continuing the form before it (or
//     the headword): `hovai, -aī` is hovaī. `X-` replaces the beginning.
//   - `+ 3s. suf.` is a pronominal suffix on the form, not the form's person.
//   - Superscript letters mark context (ʳ only in rhyme, ᵈ Dakhana, ˢ
//     Sahaskriti, ᵗ Torki, ᵃ alliterative); superscript digits point at a
//     homograph entry; `†` not in Guru Nanak; `*` hypothetical (never linked).
//   - Capitalized sigla with a number (`Ml3`, `Ga15ʳ`) cite the passage.
//
// One narrowing of the carry-forward rule: a tag introduced on an item that
// cites a single passage is scoped to that item. In `pres. ptc. hotaü, -o,
// mpd. hūte Ml3, hoṁdā` the mpd. reading is Shackle's note on one attestation;
// hoṁdā (an -ā form) is back under plain `pres. ptc.`.

import { tokenize, type Tok } from "./reverse";

export type ParsedForm = {
  form_roman: string;
  /** Verbatim tags in effect, outermost first (`["pres.", "3s."]`). */
  grammar_tags: string[];
  /** The tags as Shackle wrote them, plus any `+ Ns. suf.`; null when untagged. */
  label_raw: string | null;
  features: FormFeatures;
};

export type FormFeatures = {
  context?: string[];
  homograph?: number;
  citations?: string[];
  note?: string;
  pronominal_suffix?: string;
  not_in_guru_nanak?: true;
  doubtful?: true;
};

export type ParseResult = {
  forms: ParsedForm[];
  /** `infl. as PĀI¹`: the entry whose paradigm this one follows. Recorded, not expanded. */
  inflectsAs: string | null;
};

/** The `inflections:` segment of a Shackle definitions.notes string. */
export function extractInflectionsRaw(notes: string | null | undefined): string | null {
  if (!notes) return null;
  for (const part of notes.split(" | ")) {
    if (part.startsWith("inflections: ")) return part.slice("inflections: ".length).trim() || null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

// Rank orders tag kinds outermost first. A new tag clears the tags of its own
// rank and every inner rank, keeping the outer ones.
const RANK_POS = 0; // as pr. / as adj.
const RANK_VERB = 1; // tense, mood, voice, non-finite form
const RANK_PERSON = 2; // 3s., 1p.
const RANK_GNC = 3; // gender / number / case: msd., so., pl.
const RANK_MOD = 4; // ext., emph. and anything unmapped

const FIXED_RANK: Record<string, number> = {
  "pr.": RANK_POS, "adj.": RANK_POS,
  "pass.": RANK_VERB, "pres.": RANK_VERB, "fut.": RANK_VERB, "imp.": RANK_VERB,
  "inf.": RANK_VERB, "ger.": RANK_VERB, "abs.": RANK_VERB, "pp.": RANK_VERB, "ptc.": RANK_VERB,
  "ext.": RANK_MOD, "emph.": RANK_MOD, "dim.": RANK_MOD, "impers.": RANK_MOD, "gen.": RANK_MOD,
};

const PERSON_RE = /^([123])([sp])([mf])?\.$/;
const GNC_RE = /^([mf])?([sp])?([dovla])?\.$/;

function tagRank(tag: string): number | null {
  const t = tag.replace(/\?$/, "");
  if (t in FIXED_RANK) return FIXED_RANK[t];
  if (PERSON_RE.test(t)) return RANK_PERSON;
  if (t !== "." && GNC_RE.test(t)) return RANK_GNC;
  return null;
}

// Words that carry no form or grammar: skipped where they stand.
const PROSE = new Set([
  "also", "or", "and", "as", "with", "throughout", "before", "only", "rarely", "the", "genitive", "etc",
  "usu.", "freq.", "etc.", "cf.", "s.v.", "uninfl.", "ppn.",
]);

type Tag = { tag: string; rank: number };
type State = Tag[];

function applyRun(state: State, run: string[]): State {
  const tags = run.map((tag) => ({ tag, rank: tagRank(tag) ?? RANK_MOD }));
  const min = Math.min(...tags.map((t) => t.rank));
  return [...state.filter((t) => t.rank < min), ...tags];
}

function dedupeStates(states: State[]): State[] {
  const seen = new Set<string>();
  return states.filter((s) => {
    const k = s.map((t) => t.tag).join(" ");
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// ---------------------------------------------------------------------------
// Form tokens
// ---------------------------------------------------------------------------

const SUPER_CONTEXT: Record<string, string> = { "ʳ": "r", "ᵈ": "d", "ˢ": "s", "ᵗ": "t", "ᵃ": "a" };
const SUPER_DIGIT: Record<string, string> = { "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9" };
const SUPER_RE = /[ʳᵈˢᵗᵃ⁰¹²³⁴⁵⁶⁷⁸⁹]+$/;
const ROMAN_RE = /^[a-zāīūṁṇṭḍṛñṅśṣġüï]+$/;
const CITATION_RE = /^[A-Z][A-Za-z]*\d[\d.]*$/;
const VOWEL_CHARS = "aāiīuūeoüïṁ";

/** Split trailing superscripts into context marks and a homograph number. */
function splitSuperscripts(tok: string): { core: string; context: string[]; homograph?: number } {
  const m = tok.match(SUPER_RE);
  if (!m) return { core: tok, context: [] };
  const context: string[] = [];
  let digits = "";
  for (const ch of m[0]) {
    if (SUPER_CONTEXT[ch]) context.push(SUPER_CONTEXT[ch]);
    else digits += SUPER_DIGIT[ch];
  }
  return { core: tok.slice(0, -m[0].length), context, homograph: digits ? Number(digits) : undefined };
}

type FormTok = {
  roman: string; // may carry a leading or trailing hyphen
  hypothetical: boolean;
  features: FormFeatures;
};

function readFormToken(raw: string): FormTok | null {
  let t = raw;
  const features: FormFeatures = {};
  let hypothetical = false;
  if (t.startsWith("†")) {
    features.not_in_guru_nanak = true;
    t = t.slice(1);
  }
  if (t.startsWith("*")) {
    hypothetical = true;
    t = t.slice(1);
  }
  if (t.endsWith("?")) {
    features.doubtful = true;
    t = t.slice(0, -1);
  }
  let flattened: string | null = null;
  const afterSup = t.match(/[⁰¹²³⁴⁵⁶⁷⁸⁹]([rdst])$/);
  if (afterSup) {
    flattened = afterSup[1];
    t = t.slice(0, -1);
  }
  const sup = splitSuperscripts(t);
  t = sup.core;
  const context = flattened ? [...sup.context, flattened] : [...sup.context];
  // A superscript the OCR flattened to a plain letter: Shackle writes the
  // inherent -a, so no form ends in a bare consonant (`-euṁr` is -euṁ in rhyme).
  const last = t.at(-1) ?? "";
  if (t.length > 1 && "rdst".includes(last) && VOWEL_CHARS.includes(t.at(-2)!)) {
    t = t.slice(0, -1);
    context.push(last);
  }
  const body = t.replace(/^-|-$/g, "");
  if (!ROMAN_RE.test(body)) return null;
  // Shackle writes the inherent -a, so a token ending in a consonant is an OCR
  // fragment (`miragal`, `-k`), not a form; it must not become a stem either.
  if (!t.endsWith("-") && !VOWEL_CHARS.includes(body.at(-1)!)) return null;
  if (context.length) features.context = [...new Set(context)];
  if (sup.homograph !== undefined) features.homograph = sup.homograph;
  return { roman: t, hypothetical, features };
}

// ---------------------------------------------------------------------------
// Suffix / prefix expansion
// ---------------------------------------------------------------------------

const join = (toks: Tok[]) => toks.map((t) => t.roman).join("");
const lastIndex = (toks: Tok[], kind: Tok["kind"], before = toks.length) => {
  for (let i = before - 1; i >= 0; i--) if (toks[i].kind === kind) return i;
  return -1;
};

/**
 * Anchored replacement: the suffix's first consonant is the stem's last
 * consonant (karaṇu + -aṇā), or the suffix's leading vowel is the vowel just
 * before the stem's last consonant (karaṁhi + -anti). Null when neither holds.
 */
function anchored(stem: string, suffix: string): string | null {
  const st = tokenize(stem);
  const sf = tokenize(suffix);
  const firstCons = sf.find((t) => t.kind === "C");
  if (!firstCons) return null;
  const lc = lastIndex(st, "C");
  if (lc < 0) return null;
  if (st[lc].roman === firstCons.roman) {
    return join(st.slice(0, lastIndex(st, "C", lc) + 1)) + suffix;
  }
  const lead = sf[0];
  if (lead.kind !== "V") return null;
  let j = lc - 1;
  while (j >= 0 && st[j].kind === "N") j--;
  if (j >= 1 && st[j].kind === "V" && st[j].roman === lead.roman && st[j - 1].kind === "C") {
    return join(st.slice(0, j)) + suffix;
  }
  return null;
}

/** Replace the stem's ending: its final vowel, or the whole vowel tail after an inherent -a. */
function replaceEnding(stem: string, suffix: string): string {
  const st = tokenize(stem);
  let end = st.length;
  while (end > 0 && st[end - 1].kind === "N") end--;
  const lc = lastIndex(st, "C", end);
  const tail = st.slice(lc + 1, end);
  if (!tail.length) return join(st.slice(0, end)) + suffix;
  const lead = tokenize(suffix)[0];
  const wholeTail = tail[0].roman === "a" || (lead?.kind === "V" && tail[0].roman === lead.roman);
  return join(st.slice(0, wholeTail ? lc + 1 : end - 1)) + suffix;
}

/**
 * Expand a suffix (`-aī`) or prefix (`pā-`) form. `prev` is the form written
 * just before it; `lastFull` the last form written out in full, which sibling
 * suffixes share (`karaṁhi, -anti, -anhi`).
 */
export function expandSuffix(affix: string, prev: string, lastFull: string = prev): string {
  if (affix.endsWith("-")) {
    const head = affix.slice(0, -1);
    const st = tokenize(prev);
    const ht = tokenize(head);
    const lastHead = ht.at(-1);
    if (!lastHead) return prev;
    const idx = st.findIndex((t) => t.kind === lastHead.kind && (t.kind === "V" || t.roman === lastHead.roman));
    return idx < 0 ? head + prev : head + join(st.slice(idx + 1));
  }
  const suffix = affix.replace(/^-/, "");
  const out = anchored(prev, suffix) ?? anchored(lastFull, suffix) ?? replaceEnding(prev, suffix);
  // `pp. -iā, -ā`: both endings sit on the headword; read from pachāniā, -ā
  // would just repeat it.
  return out === prev && lastFull !== prev ? replaceEnding(lastFull, suffix) : out;
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/**
 * Parse an inflections note. `headwordRoman` is the stem for suffix forms that
 * open a group (`pd. -e` under ਰਾਜਾ).
 */
export function parseInflections(raw: string, headwordRoman: string): ParseResult {
  let text = raw.normalize("NFC").trim();
  if (text.startsWith("(") && text.endsWith(")")) text = text.slice(1, -1);

  // Bracketed notes attach to the form before them; park them as placeholders.
  const notes: string[] = [];
  text = text.replace(/\s*\[([^\]]*)\]/g, (_, n: string) => ` §${notes.push(n.trim()) - 1}`);
  text = text.replace(/[()]/g, " ");

  const forms: ParsedForm[] = [];
  let inflectsAs: string | null = null;

  for (const group of text.split(/[;:]/)) {
    let states: State[] = [[]];
    let pendingAlts: string[][] = [];
    let prev = headwordRoman;
    let lastFull = headwordRoman;

    for (const item of group.split(",")) {
      const toks = item.trim().split(/\s+/).filter(Boolean);
      if (!toks.length) continue;

      if (toks[0] === "infl.") {
        if (toks[1] === "as" && toks[2] && /^[A-ZĀĪŪ]/.test(toks[2])) inflectsAs = toks[2];
        continue;
      }
      // A usage note (`int. + le, lai`, `+ kari`) runs to the end of the group:
      // the words after it are collocates, not forms.
      if (toks[0] === "int." || (toks[0] === "+" && toks[1] && tagRank(toks[1]) === null)) break;
      if (toks.includes("of") || toks.some((t) => t.startsWith("'"))) continue;

      const run: string[] = [];
      const suffixTags: string[] = [];
      const itemForms: { tok: FormTok; idx: number }[] = [];
      let inSuffix = false;
      let abandoned = false;
      let cited = false;

      for (const tok of toks) {
        const lastForm = itemForms.at(-1);
        if (tok === "+") {
          inSuffix = true;
          continue;
        }
        if (inSuffix) {
          if (tok === "suf.") inSuffix = false;
          else if (tagRank(tok) !== null) suffixTags.push(tok);
          else {
            abandoned = true; // `int. + de`: a usage note, not an inflection
            break;
          }
          continue;
        }
        if (/^§\d+$/.test(tok)) {
          if (lastForm) lastForm.tok.features.note = notes[Number(tok.slice(1))];
          continue;
        }
        if (PROSE.has(tok)) continue;
        if (tagRank(tok) !== null) {
          if (!itemForms.length) run.push(tok);
          continue;
        }
        const sup = splitSuperscripts(tok);
        if (CITATION_RE.test(sup.core) || /^\d[\d.]*$/.test(sup.core)) {
          if (lastForm) {
            const f = lastForm.tok.features;
            if (CITATION_RE.test(sup.core)) (f.citations ??= []).push(sup.core);
            if (sup.context.length) f.context = [...new Set([...(f.context ?? []), ...sup.context])];
          }
          cited = true;
          continue;
        }
        const form = readFormToken(tok);
        if (form) itemForms.push({ tok: form, idx: itemForms.length });
      }
      if (abandoned) continue;

      // A tag-only item is an alternative reading for whatever comes next.
      if (!itemForms.length) {
        if (run.length) pendingAlts.push(run);
        continue;
      }

      const before = states;
      const alts = run.length ? [...pendingAlts, run] : pendingAlts;
      const pendingAltsUsed = pendingAlts.length;
      if (alts.length) states = dedupeStates(states.flatMap((s) => alts.map((r) => applyRun(s, r))));
      pendingAlts = [];

      for (const { tok } of itemForms) {
        if (tok.hypothetical) continue;
        let roman = tok.roman;
        if (roman.startsWith("-") || roman.endsWith("-")) roman = expandSuffix(roman, prev, lastFull);
        else lastFull = roman;
        prev = roman;

        const features: FormFeatures = { ...tok.features };
        if (suffixTags.length) features.pronominal_suffix = suffixTags.join(" ");
        for (const state of states) {
          const tags = state.map((t) => t.tag);
          if (tags.some((t) => t.endsWith("?")) || suffixTags.some((t) => t.endsWith("?"))) features.doubtful = true;
          const label = [...tags, ...(suffixTags.length ? ["+", ...suffixTags, "suf."] : [])].join(" ");
          forms.push({ form_roman: roman, grammar_tags: tags, label_raw: label || null, features: { ...features } });
        }
      }

      // Scope a cited item's tags to it only when they refine the tags already
      // in effect (every new tag inner to every old one), as `mpd. hūte Ml3`
      // does under `pres. ptc.`; a run that starts a new set carries on.
      const refines = (s: State) => s.length > 0 && run.every((t) => (tagRank(t) ?? RANK_MOD) > Math.max(...s.map((x) => x.rank)));
      if (cited && run.length && pendingAltsUsed === 0 && before.every(refines)) states = before;
    }
  }

  return { forms, inflectsAs };
}

// ---------------------------------------------------------------------------
// Tags -> migration 023 feature columns
// ---------------------------------------------------------------------------

export type FeatureColumns = {
  person: "first" | "second" | "third" | null;
  number: "singular" | "plural" | null;
  gender: "masculine" | "feminine" | null;
  gram_case: "direct" | "oblique" | "vocative" | "locative" | "ablative" | null;
  verb_form: "infinitive" | "gerundive" | "absolutive" | "present_participle" | "past_participle" | null;
  tense_mood: "present" | "future" | "imperative" | null;
  /** Tag meanings with no 023 column: passive voice, emphatic, extended, use as pronoun/adjective. */
  extra: Record<string, string | boolean>;
};

const PERSONS = { "1": "first", "2": "second", "3": "third" } as const;
const NUMBERS = { s: "singular", p: "plural" } as const;
const GENDERS = { m: "masculine", f: "feminine" } as const;
const CASES = { d: "direct", o: "oblique", v: "vocative", l: "locative", a: "ablative" } as const;

/** Map verbatim Shackle tags onto word_forms' normalized columns. Unmapped tags stay in label_raw only. */
export function featureColumns(tags: string[]): FeatureColumns {
  const c: FeatureColumns = {
    person: null, number: null, gender: null, gram_case: null, verb_form: null, tense_mood: null, extra: {},
  };
  const ts = tags.map((t) => t.replace(/\?$/, ""));
  const participle = ts.includes("ptc.");
  for (const t of ts) {
    const p = t.match(PERSON_RE);
    if (p) {
      c.person = PERSONS[p[1] as keyof typeof PERSONS];
      c.number = NUMBERS[p[2] as keyof typeof NUMBERS];
      if (p[3]) c.gender = GENDERS[p[3] as keyof typeof GENDERS];
      continue;
    }
    const g = t !== "." ? t.match(GNC_RE) : null;
    if (g && tagRank(t) === RANK_GNC) {
      if (g[1]) c.gender = GENDERS[g[1] as keyof typeof GENDERS];
      if (g[2]) c.number = NUMBERS[g[2] as keyof typeof NUMBERS];
      if (g[3]) c.gram_case = CASES[g[3] as keyof typeof CASES];
      continue;
    }
    switch (t) {
      case "pres.":
        if (participle) c.verb_form = "present_participle";
        else c.tense_mood = "present";
        break;
      case "fut.": c.tense_mood = "future"; break;
      case "imp.": c.tense_mood = "imperative"; break;
      case "inf.": c.verb_form = "infinitive"; break;
      case "ger.": c.verb_form = "gerundive"; break;
      case "abs.": c.verb_form = "absolutive"; break;
      case "pp.": c.verb_form = "past_participle"; break;
      case "pass.": c.extra.voice = "passive"; break;
      case "emph.": c.extra.emphatic = true; break;
      case "ext.": c.extra.extended = true; break;
      case "pr.": c.extra.as_pos = "pronoun"; break;
      case "adj.": c.extra.as_pos = "adjective"; break;
    }
  }
  return c;
}
