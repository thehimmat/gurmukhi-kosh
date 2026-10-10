// Plan Sahib Singh's pad-arth gloss list as rows (#165): one row per glossed
// term, linked to the word occurrences it glosses, with case evidence read
// from the gloss.
//
// Pure, so it tests without a database; ingest-glosses.ts writes the plan.
//
// Every row stays on the line BaniDB files it under (lines.id, never
// verse_id: #162). Some rows carry glosses for neighbouring lines too (line
// 178 holds all of Pauri 20, the ਮਃ ੫ heading holds the next verse's ਰਜਿ ਰਜਿ);
// those neighbours have their own copy, so a term that is not on its own line
// is stored but left unlinked rather than moved.
//
// Linking, strictest first:
//   exact / gapped  the term's words are in the line (lib/padarth/align.ts)
//   via_base        one word, not in the line, but Shackle lists it and a
//                   word of the line in the same paradigm (word_forms, #18):
//                   ਪੁਰੀ beside ਪੁਰੀਆ. The shared lexeme is recorded.
// Nothing looser: no spelling-similarity tier. An unlinked term is kept.

import { alignTerms, normalise } from "../../lib/padarth/align";
import { caseEvidence, type CaseEvidence } from "../../lib/padarth/case-evidence";
import { parsePadarth } from "../../lib/padarth/parse";

export type PlanToken = { occurrenceId: number; position: number; wordId: number; gurmukhi: string };

export type PlanInput = {
  /** Lines with their word occurrences. A pad-arth row whose line is absent is stored unlinked. */
  lines: { lineId: number; tokens: PlanToken[] }[];
  padarth: { lineId: number; body: string }[];
  /** Lexeme hubs each word belongs to (Shackle word_forms, roots included). */
  lexemesByWord: Map<number, number[]>;
  /** words.id by spelling, for looking up a term that is not in its line. */
  wordIdByGurmukhi: Map<string, number>;
};

export type PlannedLink = {
  occurrenceId: number;
  match: "exact" | "gapped" | "via_base";
  /** The shared Shackle lexeme, for via_base links. */
  lexemeId: number | null;
};

export type PlannedGloss = {
  lineId: number;
  /** Position in the source row, notes and entries together. */
  ordinal: number;
  /** "note": text before the row's first entry, kept verbatim. */
  kind: "entry" | "note";
  term: string | null;
  gloss: string;
  notes: string[];
  isPhrase: boolean;
  links: PlannedLink[];
  caseEvidence: CaseEvidence[];
};

export type GlossPlanStats = {
  rows: number;
  entries: number;
  notes: number;
  phrases: number;
  /** Entries with at least one link. */
  linked: number;
  /** Entries linked only through a shared lexeme. */
  viaBase: number;
  unlinked: number;
  links: number;
  caseEvidence: number;
};

function baseLink(
  term: string,
  tokens: PlanToken[],
  wordIdByKey: Map<string, number>,
  lexemesByWord: Map<number, number[]>
): PlannedLink | null {
  const termWord = wordIdByKey.get(normalise(term));
  const termLexemes = termWord === undefined ? [] : (lexemesByWord.get(termWord) ?? []);
  if (termLexemes.length === 0) return null;
  for (const t of tokens) {
    const shared = (lexemesByWord.get(t.wordId) ?? []).find((l) => termLexemes.includes(l));
    if (shared !== undefined) return { occurrenceId: t.occurrenceId, match: "via_base", lexemeId: shared };
  }
  return null;
}

export function planGlosses(input: PlanInput): { glosses: PlannedGloss[]; stats: GlossPlanStats } {
  const tokensByLine = new Map(
    input.lines.map((l) => [l.lineId, [...l.tokens].sort((a, b) => a.position - b.position)])
  );
  const wordIdByKey = new Map([...input.wordIdByGurmukhi].map(([g, id]) => [normalise(g), id]));

  const glosses: PlannedGloss[] = [];
  for (const row of input.padarth) {
    const tokens = tokensByLine.get(row.lineId) ?? [];
    const { entries, leading } = parsePadarth(row.body);
    const aligned = alignTerms(
      tokens.map((t) => t.gurmukhi),
      entries.map((e) => e.term)
    );

    let ordinal = 0;
    for (const note of leading) {
      glosses.push({
        lineId: row.lineId,
        ordinal: ordinal++,
        kind: "note",
        term: null,
        gloss: note,
        notes: [],
        isPhrase: false,
        links: [],
        caseEvidence: [],
      });
    }

    entries.forEach((entry, k) => {
      const isPhrase = entry.term.includes(" ");
      const m = aligned[k];
      let links: PlannedLink[] = [];
      if (m) {
        links = m.positions.map((p) => ({ occurrenceId: tokens[p].occurrenceId, match: m.match, lexemeId: null }));
      } else if (!isPhrase) {
        const viaBase = baseLink(entry.term, tokens, wordIdByKey, input.lexemesByWord);
        if (viaBase) links = [viaBase];
      }
      glosses.push({
        lineId: row.lineId,
        ordinal: ordinal++,
        kind: "entry",
        term: entry.term,
        gloss: entry.gloss,
        notes: entry.notes,
        isPhrase,
        links,
        caseEvidence: caseEvidence(entry.gloss),
      });
    });
  }

  const entryRows = glosses.filter((g) => g.kind === "entry");
  return {
    glosses,
    stats: {
      rows: input.padarth.length,
      entries: entryRows.length,
      notes: glosses.length - entryRows.length,
      phrases: entryRows.filter((g) => g.isPhrase).length,
      linked: entryRows.filter((g) => g.links.length > 0).length,
      viaBase: entryRows.filter((g) => g.links.some((l) => l.match === "via_base")).length,
      unlinked: entryRows.filter((g) => g.links.length === 0).length,
      links: entryRows.reduce((n, g) => n + g.links.length, 0),
      caseEvidence: entryRows.reduce((n, g) => n + g.caseEvidence.length, 0),
    },
  };
}
