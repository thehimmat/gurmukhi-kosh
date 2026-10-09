// Plan Shackle's inflected-form links (#18): parse each definition's
// `inflections:` note, reverse-transliterate every form, keep the forms the
// corpus attests, and lay them out as lexeme hubs + word_forms rows.
//
// Pure, so it tests without a database; ingest-form-links.ts writes the plan.
//
// The corpus is closed (#30): a form links only when one of its Gurmukhi
// spellings is an existing in-corpus words row, which also filters out bad
// transliterations and bad suffix expansions. Spellings are lossless only: ṁ
// may be ੰ or ਂ, but an omitted nasal or bare sonorant spells a different word.
//
// One hub per headword word (#30 decision 2). Homograph entries share it
// (three ਪਾਇ entries -> one hub); each form row records its definition_id, so
// the sense it belongs to is never lost. A form link sits beside any direct
// definition of the same word and never replaces it: this only writes
// word_forms / lexemes / lexeme_citations.

import { candidateSpellings, gurmukhiToShackle, reverseTransliterate } from "./reverse";
import { extractInflectionsRaw, featureColumns, parseInflections, type FeatureColumns } from "./inflections";

export type ShackleEntry = {
  definitionId: number;
  /** The definition's words row: Shackle's headword. */
  wordId: number;
  headword: string;
  senseNumber: number;
  notes: string | null;
};

export type PlannedLexeme = {
  rootWordId: number;
  headword: string;
  /** `infl. as PĀI¹` pointers, kept as Shackle's statement rather than expanded. */
  citationNotes: string | null;
};

export type PlannedForm = Omit<FeatureColumns, "extra"> & {
  headword: string;
  rootWordId: number;
  wordId: number;
  reading_number: number;
  label_raw: string | null;
  features: Record<string, unknown>;
};

export type PlanStats = {
  entries: number;
  parsedForms: number;
  linkedForms: number;
  /** Forms with no attested lossless spelling. */
  unresolved: number;
  /** Of those, how many an omitted nasal / bare sonorant would have matched (not linked). */
  lossyOnly: number;
};

export type FormLinkPlan = { lexemes: PlannedLexeme[]; forms: PlannedForm[]; stats: PlanStats };

/** `corpus` maps each in-corpus words.gurmukhi (NFC) to its id. */
export function planFormLinks(entries: ShackleEntry[], corpus: Map<string, number>): FormLinkPlan {
  const stats: PlanStats = { entries: 0, parsedForms: 0, linkedForms: 0, unresolved: 0, lossyOnly: 0 };
  const hubs = new Map<number, { lexeme: PlannedLexeme; forms: Omit<PlannedForm, "reading_number">[]; seen: Set<string> }>();
  const order: number[] = [];

  for (const e of entries) {
    const raw = extractInflectionsRaw(e.notes);
    if (!raw) continue;
    stats.entries++;
    const { forms, inflectsAs } = parseInflections(raw, gurmukhiToShackle(e.headword));

    const linked: Omit<PlannedForm, "reading_number">[] = [];
    for (const f of forms) {
      stats.parsedForms++;
      const rev = reverseTransliterate(f.form_roman);
      const wordIds = [...new Set(candidateSpellings(rev, { lossless: true }).flatMap((g) => corpus.get(g) ?? []))];
      if (!wordIds.length) {
        stats.unresolved++;
        if (candidateSpellings(rev).some((g) => corpus.has(g))) stats.lossyOnly++;
        continue;
      }
      stats.linkedForms++;
      const { extra, ...cols } = featureColumns(f.grammar_tags);
      for (const wordId of wordIds) {
        linked.push({
          headword: e.headword,
          rootWordId: e.wordId,
          wordId,
          label_raw: f.label_raw,
          ...cols,
          features: {
            ...f.features,
            ...extra,
            form_roman: f.form_roman,
            shackle_tags: f.grammar_tags,
            definition_id: e.definitionId,
            sense_number: e.senseNumber,
          },
        });
      }
    }

    let hub = hubs.get(e.wordId);
    if (!linked.length) {
      if (hub && inflectsAs) appendNote(hub.lexeme, e.definitionId, inflectsAs);
      continue;
    }
    if (!hub) {
      hub = { lexeme: { rootWordId: e.wordId, headword: e.headword, citationNotes: null }, forms: [], seen: new Set() };
      hub.forms.push(citationRow(e));
      hubs.set(e.wordId, hub);
      order.push(e.wordId);
    }
    if (inflectsAs) appendNote(hub.lexeme, e.definitionId, inflectsAs);
    for (const row of linked) {
      const key = [row.wordId, row.label_raw, row.features.definition_id, row.features.form_roman].join("|");
      if (hub.seen.has(key)) continue;
      hub.seen.add(key);
      hub.forms.push(row);
    }
  }

  const lexemes: PlannedLexeme[] = [];
  const out: PlannedForm[] = [];
  for (const root of order) {
    const hub = hubs.get(root)!;
    lexemes.push(hub.lexeme);
    const readings = new Map<number, number>();
    for (const row of hub.forms) {
      const n = (readings.get(row.wordId) ?? 0) + 1;
      readings.set(row.wordId, n);
      out.push({ ...row, reading_number: n });
    }
  }
  return { lexemes, forms: out, stats };
}

/** The headword's own membership: Shackle's citation form, no grammar claimed. */
function citationRow(e: ShackleEntry): Omit<PlannedForm, "reading_number"> {
  return {
    headword: e.headword,
    rootWordId: e.wordId,
    wordId: e.wordId,
    label_raw: null,
    person: null,
    number: null,
    gender: null,
    gram_case: null,
    verb_form: null,
    tense_mood: null,
    features: { headword: true },
  };
}

function appendNote(lexeme: PlannedLexeme, definitionId: number, inflectsAs: string) {
  const note = `definition ${definitionId}: infl. as ${inflectsAs}`;
  lexeme.citationNotes = lexeme.citationNotes ? `${lexeme.citationNotes}; ${note}` : note;
}
