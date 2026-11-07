// Draft a pad-arth for one line (#23): every word of the line, in order, with every candidate
// gloss the database holds for it, and the grammar it can state or hedge. Pure: the caller
// fetches the rows (lib/padarth/fetch.ts), the builder shows the draft and saves picks (084).
//
// What the draft does, and what it deliberately does not:
//   - Every word gets a row on every line, repeats included. Thinning is the editor's choice.
//   - Candidates are all kept, ordered, never chosen. Choosing is the curator's pick.
//       1. Sahib Singh's pad-arth gloss for this line (it is about this occurrence)
//       2. the word's own dictionary senses, by source priority then sense number
//       3. the senses of the headword Shackle links the form to, labelled with the link
//       4. the senses of the entry a Mahan Kosh pointer row ("ਦੇਖੋ, ਮੰਞੁ.") sends the reader to,
//          one hop, only the sense it numbers if it numbers one, labelled with the pointer
//       5. only when 1–4 give no dictionary sense: the senses of the word's spelling variants
//          (#377), first those that differ in spelling only (ਣ/ਨ, nasal signs, nukta), then those
//          that also differ in vowel length or the final short matra, which carry grammar; each
//          labelled with the variant
//     Cross-reference-only rows ("see ਦਰੁ", "ਦੇਖੋ, ਮੰਞੁ.") are dropped: they are not glosses. Entries whose
//     Gurmukhi was reverse-transliterated from Shackle's romanisation rank last and are marked
//     lowPriority, because they can collide with an unrelated word (ਦਰਿ "grind coarsely" against
//     the locative of ਦਰੁ).
//   - Phrases come after the words, and only phrases a source defines: Sahib Singh's multi-word
//     entries for this line, and Shackle's compounds and glossed phrases (087) wherever their words
//     stand together in the line, matched by spelling (foldSpelling), never by ending. A phrase's
//     gloss is not repeated on its words.
//   - Grammar has three tiers (#23):
//       stated  a scholar says it: Shackle's label for a linked form, an imported word_grammar
//               row (Sahib Singh's only when he wrote it on this line), Mahan Kosh's part of speech
//       clue    case read from the postposition in Sahib Singh's gloss, citing that gloss
//       nothing everything else. Rule-derived rows are never shown.
//   - No inflection guessing, no spelling-similarity matching, no authored text.

import type { CaseEvidence } from "./case-evidence";
import { parseMkPointer } from "./mk-pointer";
import { foldSpelling } from "../gurmukhi-fold";

export type DraftToken = { position: number; wordId: number; gurmukhi: string };

export type DraftDefinition = {
  id: number;
  wordId: number;
  /** dict_sources.code */
  sourceCode: string;
  senseNumber: number | null;
  /** definition_text, in the source's language */
  text: string;
  /** definition_en, for a non-English source */
  textEn: string | null;
  notes: string | null;
};

/** A Shackle form link (word_forms, #18): this word is a form of the headword. Not the hub's own row. */
export type DraftFormLink = {
  wordId: number;
  lexemeId: number;
  headwordWordId: number;
  headword: string;
  sourceCode: string;
  /** Shackle's own label for the form, verbatim (word_forms.label_raw). */
  labelRaw: string | null;
  /** The headword sense he gives it under (features.definition_id), for homograph hubs. */
  definitionId: number | null;
};

export type DraftPadarthGloss = {
  id: number;
  ordinal: number;
  term: string;
  gloss: string;
  notes: string[];
  isPhrase: boolean;
  /** The line positions it is linked to (padarth_gloss_occurrences). Empty: unplaced. */
  links: { position: number; match: "exact" | "gapped" | "via_base"; lexemeId: number | null }[];
  caseEvidence: CaseEvidence[];
};

export type DraftGrammarRow = {
  id: number;
  wordId: number;
  sourceCode: string | null;
  provenance: string;
  /** The line a per-line source (Sahib Singh) stated it on; null for a word-level statement. */
  sourceLineId: number | null;
  pos: string | null;
  gender: string | null;
  number: string | null;
  gramCase: string | null;
  person?: string | null;
  verbForm?: string | null;
};

export type DraftInput = {
  lineId: number;
  tokens: DraftToken[];
  /** Definitions of the line's words and of the headwords in formLinks. */
  definitions: DraftDefinition[];
  formLinks: DraftFormLink[];
  /** This line's pad-arth entries (kind 'entry'). */
  padarth: DraftPadarthGloss[];
  grammar: DraftGrammarRow[];
  /** The words Mahan Kosh pointer rows name, where the corpus has them (definitions included above). */
  mkPointerTargets?: { target: string; wordId: number }[];
  /** Other words that fold to the same key as a line word (lib/gurmukhi-fold.ts), definitions included above. */
  variants?: DraftVariant[];
  /** A dictionary's glossed phrases (087), matched against the line here. */
  collocations?: DraftCollocation[];
};

export type DraftCollocation = {
  id: number;
  sourceCode: string;
  /** The phrase in Gurmukhi, as reverse-transliterated. */
  phrase: string;
  /** Per word, every spelling the source's romanisation allows. */
  members: string[][];
  gloss: string;
  posRaw: string | null;
  origin: "compound" | "usage";
};

/** A spelling variant of a line word: "spelling" folds equal under foldSpelling, "ending" only under foldGurmukhi. */
export type DraftVariant = { wordId: number; variantWordId: number; variant: string; tier: "spelling" | "ending" };

export type PadarthCandidate = {
  kind: "padarth_gloss";
  glossId: number;
  /** Its place in Sahib Singh's row: the stable key a saved pick keeps (084). */
  ordinal: number;
  sourceCode: "ss_padarth";
  term: string;
  text: string;
  notes: string[];
  match: "exact" | "gapped" | "via_base";
  lexemeId: number | null;
};

export type DefinitionCandidate = {
  kind: "definition";
  definitionId: number;
  /** The word the sense belongs to (the headword, for a via link): a saved pick's key. */
  wordId: number;
  sourceCode: string;
  senseNumber: number | null;
  text: string;
  textEn: string | null;
  /**
   * Set when the sense is another entry's: the headword a Shackle form link names (lexemeId set),
   * or the entry a Mahan Kosh "ਦੇਖੋ" row points to (lexemeId null).
   */
  via: {
    headword: string;
    headwordWordId: number;
    lexemeId: number | null;
    link: "shackle_form" | "mk_pointer" | "spelling_variant" | "ending_variant";
  } | null;
  lowPriority: boolean;
};

export type CollocationCandidate = {
  kind: "collocation";
  collocationId: number;
  sourceCode: string;
  term: string;
  text: string;
  posRaw: string | null;
  origin: "compound" | "usage";
};

export type Candidate = PadarthCandidate | DefinitionCandidate | CollocationCandidate;

export type GrammarAttribute = "pos" | "gender" | "number" | "gramCase" | "person" | "verbForm";

export type GrammarNote =
  | { tier: "stated"; kind: "form_label"; sourceCode: string; text: string; headword: string }
  | { tier: "stated"; kind: "grammar"; sourceCode: string; grammarId: number; facts: { attribute: GrammarAttribute; value: string }[] }
  | { tier: "clue"; kind: "case"; sourceCode: "ss_padarth"; glossId: number; gramCase: string; marker: string; basis: string };

/** A Mahan Kosh "ਦੇਖੋ" target of this word; resolved when the corpus has that word. */
export type DraftPointer = { target: string; sense: number | null; resolved: boolean };

export type DraftWord = DraftToken & { candidates: Candidate[]; grammar: GrammarNote[]; uncovered: boolean; pointers: DraftPointer[] };

export type DraftPhrase = { positions: number[]; surface: string; candidates: (PadarthCandidate | CollocationCandidate)[]; grammar: GrammarNote[] };

export type DraftLine = { lineId: number; words: DraftWord[]; phrases: DraftPhrase[]; unplaced: DraftPadarthGloss[] };

/** Dictionary order when nothing else decides: our own entries, then Guru-Nanak-scoped English, then the rest. */
const SOURCE_PRIORITY = ["manual", "shackle", "mahan_kosh", "sikhri"];
const sourceRank = (code: string) => {
  const i = SOURCE_PRIORITY.indexOf(code);
  return i < 0 ? SOURCE_PRIORITY.length : i;
};

const noteParts = (d: DraftDefinition) => (d.notes ?? "").split(" | ").map((s) => s.trim());
const mkPointers = (d: DraftDefinition) => (d.sourceCode === "mahan_kosh" ? parseMkPointer(d.text) : null);
const isCrossRefOnly = (d: DraftDefinition) =>
  d.text === "(cross-reference)" || noteParts(d).includes("cross-reference-only") || mkPointers(d) !== null;
const isDerivedSpelling = (d: DraftDefinition) => noteParts(d).some((n) => n.startsWith("gurmukhi-derived"));

function byPriority(a: DraftDefinition, b: DraftDefinition): number {
  return (
    Number(isDerivedSpelling(a)) - Number(isDerivedSpelling(b)) ||
    sourceRank(a.sourceCode) - sourceRank(b.sourceCode) ||
    a.sourceCode.localeCompare(b.sourceCode) ||
    (a.senseNumber ?? Infinity) - (b.senseNumber ?? Infinity) ||
    a.id - b.id
  );
}

function definitionCandidate(d: DraftDefinition, via: DefinitionCandidate["via"]): DefinitionCandidate {
  return {
    kind: "definition",
    definitionId: d.id,
    wordId: d.wordId,
    sourceCode: d.sourceCode,
    senseNumber: d.senseNumber,
    text: d.text,
    textEn: d.textEn,
    via,
    lowPriority: isDerivedSpelling(d),
  };
}

function padarthCandidate(g: DraftPadarthGloss, position: number | null): PadarthCandidate {
  const link = position === null ? g.links[0] : g.links.find((l) => l.position === position);
  return {
    kind: "padarth_gloss",
    glossId: g.id,
    ordinal: g.ordinal,
    sourceCode: "ss_padarth",
    term: g.term,
    text: g.gloss,
    notes: g.notes,
    match: link?.match ?? "exact",
    lexemeId: link?.lexemeId ?? null,
  };
}

const caseClues = (g: DraftPadarthGloss): GrammarNote[] =>
  g.caseEvidence.map((c) => ({ tier: "clue", kind: "case", sourceCode: "ss_padarth", glossId: g.id, gramCase: c.gramCase, marker: c.marker, basis: c.basis }));

const ATTRIBUTES: GrammarAttribute[] = ["pos", "gender", "number", "gramCase", "person", "verbForm"];

function statedGrammar(g: DraftGrammarRow, lineId: number): GrammarNote | null {
  if (g.sourceLineId !== null && g.sourceLineId !== lineId) return null;
  // Mahan Kosh states a part of speech and nothing else (as on the word page, lib/grammar-view.ts).
  const attributes: GrammarAttribute[] = g.sourceCode === "mahan_kosh" ? ["pos"] : ATTRIBUTES;
  // Anything not read from a cited source is inference, and is never shown.
  if (g.sourceCode !== "mahan_kosh" && (g.provenance !== "imported" || !g.sourceCode)) return null;
  const facts = attributes.flatMap((attribute) => {
    const value = g[attribute];
    return value ? [{ attribute, value }] : [];
  });
  return facts.length ? { tier: "stated", kind: "grammar", sourceCode: g.sourceCode!, grammarId: g.id, facts } : null;
}

export function draftLine(input: DraftInput): DraftLine {
  const tokens = [...input.tokens].sort((a, b) => a.position - b.position);
  const defsByWord = new Map<number, DraftDefinition[]>();
  const pointersByWord = new Map<number, { target: string; sense: number | null }[]>();
  for (const d of input.definitions) {
    const pointers = mkPointers(d);
    if (pointers) pointersByWord.set(d.wordId, [...(pointersByWord.get(d.wordId) ?? []), ...pointers]);
    if (isCrossRefOnly(d)) continue;
    defsByWord.set(d.wordId, [...(defsByWord.get(d.wordId) ?? []), d]);
  }
  const targetWord = new Map((input.mkPointerTargets ?? []).map((t) => [t.target, t.wordId]));
  const single = input.padarth.filter((g) => !g.isPhrase && g.links.length > 0);

  const words: DraftWord[] = tokens.map((t) => {
    const padarth = single.filter((g) => g.links.some((l) => l.position === t.position)).sort((a, b) => a.ordinal - b.ordinal);
    const own = (defsByWord.get(t.wordId) ?? []).sort(byPriority).map((d) => definitionCandidate(d, null));

    const links = input.formLinks.filter((f) => f.wordId === t.wordId && f.headwordWordId !== t.wordId);
    const seen = new Set(own.map((c) => c.definitionId));
    const viaBase: DefinitionCandidate[] = [];
    for (const f of links) {
      const senses = (defsByWord.get(f.headwordWordId) ?? [])
        .filter((d) => d.sourceCode === f.sourceCode && (f.definitionId === null || d.id === f.definitionId))
        .sort(byPriority);
      for (const d of senses) {
        if (seen.has(d.id)) continue;
        seen.add(d.id);
        viaBase.push(definitionCandidate(d, { headword: f.headword, headwordWordId: f.headwordWordId, lexemeId: f.lexemeId, link: "shackle_form" }));
      }
    }

    // Mahan Kosh "ਦੇਖੋ" rows: the target entry's own Mahan Kosh senses, one hop.
    const pointers: DraftPointer[] = [];
    const viaPointer: DefinitionCandidate[] = [];
    for (const p of pointersByWord.get(t.wordId) ?? []) {
      if (pointers.some((q) => q.target === p.target && q.sense === p.sense)) continue;
      const wordId = targetWord.get(p.target);
      pointers.push({ ...p, resolved: wordId !== undefined });
      if (wordId === undefined) continue;
      const senses = (defsByWord.get(wordId) ?? []).filter((d) => d.sourceCode === "mahan_kosh");
      const named = p.sense === null ? [] : senses.filter((d) => d.senseNumber === p.sense);
      for (const d of (named.length ? named : senses).sort(byPriority)) {
        if (seen.has(d.id)) continue;
        seen.add(d.id);
        viaPointer.push(definitionCandidate(d, { headword: p.target, headwordWordId: wordId, lexemeId: null, link: "mk_pointer" }));
      }
    }

    const grammar: GrammarNote[] = [
      ...links.flatMap((f): GrammarNote[] =>
        f.labelRaw ? [{ tier: "stated", kind: "form_label", sourceCode: f.sourceCode, text: f.labelRaw, headword: f.headword }] : []
      ),
      ...input.grammar.filter((g) => g.wordId === t.wordId).flatMap((g) => statedGrammar(g, input.lineId) ?? []),
      ...padarth.flatMap(caseClues),
    ];

    // Spelling variants, only for a word the dictionaries give nothing for.
    const viaVariant: DefinitionCandidate[] = [];
    if (own.length + viaBase.length + viaPointer.length === 0) {
      const mine = (input.variants ?? []).filter((v) => v.wordId === t.wordId && v.variantWordId !== t.wordId);
      for (const tier of ["spelling", "ending"] as const) {
        for (const v of mine.filter((m) => m.tier === tier).sort((a, b) => a.variant.localeCompare(b.variant))) {
          for (const d of (defsByWord.get(v.variantWordId) ?? []).sort(byPriority)) {
            if (seen.has(d.id)) continue;
            seen.add(d.id);
            viaVariant.push(
              definitionCandidate(d, { headword: v.variant, headwordWordId: v.variantWordId, lexemeId: null, link: tier === "spelling" ? "spelling_variant" : "ending_variant" })
            );
          }
        }
      }
    }

    const candidates: Candidate[] = [...padarth.map((g) => padarthCandidate(g, t.position)), ...own, ...viaBase, ...viaPointer, ...viaVariant];
    return { ...t, candidates, grammar, uncovered: candidates.length === 0, pointers };
  });

  // Phrases a source defines, grouped by the words they cover, after the words.
  const byKey = new Map<string, DraftPhrase>();
  const surface = (positions: number[]) =>
    positions
      .map((p, i) => {
        const word = tokens.find((t) => t.position === p)?.gurmukhi ?? "";
        return i > 0 && p !== positions[i - 1] + 1 ? `… ${word}` : word;
      })
      .join(" ");
  for (const g of input.padarth.filter((g) => g.isPhrase && g.links.length > 0).sort((a, b) => a.ordinal - b.ordinal)) {
    const positions = [...new Set(g.links.map((l) => l.position))].sort((a, b) => a - b);
    const key = positions.join(",");
    const phrase = byKey.get(key) ?? { positions, surface: surface(positions), candidates: [], grammar: [] };
    phrase.candidates.push(padarthCandidate(g, null));
    phrase.grammar.push(...caseClues(g));
    byKey.set(key, phrase);
  }
  // A dictionary's phrases, wherever their words stand together in the line.
  if (input.collocations?.length) {
    const index = collocationIndex(input.collocations);
    const keys = tokens.map((t) => foldSpelling(t.gurmukhi));
    for (let i = 0; i < tokens.length; i++) {
      for (const c of index.get(keys[i]) ?? []) {
        const k = c.members.length;
        if (i + k > tokens.length) continue;
        let ok = true;
        for (let j = 1; j < k && ok; j++) ok = c.folded[j].has(keys[i + j]);
        if (!ok) continue;
        const positions = tokens.slice(i, i + k).map((t) => t.position);
        const key = positions.join(",");
        const phrase = byKey.get(key) ?? { positions, surface: surface(positions), candidates: [], grammar: [] };
        if (phrase.candidates.some((x) => x.kind === "collocation" && x.collocationId === c.id)) continue;
        phrase.candidates.push({ kind: "collocation", collocationId: c.id, sourceCode: c.sourceCode, term: c.phrase, text: c.gloss, posRaw: c.posRaw, origin: c.origin });
        byKey.set(key, phrase);
      }
    }
  }
  const phrases = [...byKey.values()].sort((a, b) => a.positions[0] - b.positions[0] || a.positions.length - b.positions.length);

  return { lineId: input.lineId, words, phrases, unplaced: input.padarth.filter((g) => g.links.length === 0) };
}

type IndexedCollocation = DraftCollocation & { folded: Set<string>[] };
const indexCache = new WeakMap<DraftCollocation[], Map<string, IndexedCollocation[]>>();

/** Collocations by the spelling-folded forms of their first word, built once per list. */
function collocationIndex(list: DraftCollocation[]): Map<string, IndexedCollocation[]> {
  const cached = indexCache.get(list);
  if (cached) return cached;
  const index = new Map<string, IndexedCollocation[]>();
  for (const c of list) {
    if (c.members.length < 2) continue;
    const folded = c.members.map((m) => new Set(m.map(foldSpelling)));
    const entry = { ...c, folded };
    for (const first of folded[0]) index.set(first, [...(index.get(first) ?? []), entry]);
  }
  indexCache.set(list, index);
  return index;
}
