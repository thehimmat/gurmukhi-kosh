// Build a word-by-word pad-arth view of a passage from rows already fetched.
//
// Pure: the caller (the admin page) fetches lines, word occurrences, dictionary
// senses, base-form links, grammar and per-line translations; this module only
// arranges them. For every line it gives each word its glosses by source, Sahib
// Singh's pad-arth placed on the words or phrases it glosses, and the phrases
// (pad-arth terms and multi-word dictionary headwords) as their own items.
//
// Nothing is chosen between senses: every sense is shown (phase 1). Base-form
// glosses appear only for a source that has nothing for the form itself, and
// say which base and on what basis.

import { alignTerms, type TermMatch } from "./align";
import { parsePadarth, type PadarthEntry } from "./parse";

const PADARTH_SOURCE = "ss_padarth";

export type Sense = { senseNumber: number; text: string; textEn: string | null };

export type GlossGroup = {
  source: string;
  /** Set when these senses belong to the word's base form, not the form itself. */
  via: { base: string; basis: string } | null;
  senses: Sense[];
};

export type GrammarFact = {
  pos: string | null;
  gender: string | null;
  number: string | null;
  gramCase: string | null;
  sourceCode: string | null;
};

export type PadarthGloss = PadarthEntry & {
  match: TermMatch["match"];
  /** The line whose pad-arth this came from, when not this line's own. */
  borrowedFromLineId: number | null;
};

export type PassageWord = {
  position: number;
  gurmukhi: string;
  wordId: number;
  glosses: GlossGroup[];
  padarth: PadarthGloss[];
  grammar: GrammarFact[];
  /** False when nothing glosses this word, alone or inside a phrase. */
  covered: boolean;
};

export type PassagePhrase = {
  /** Indices into the line's `words`. */
  positions: number[];
  /** The line's own words; "…" marks a gap (ਕੂੜੈ … ਪਾਲਿ). */
  text: string;
  padarth: PadarthGloss[];
  glosses: GlossGroup[];
};

export type PassageLine = {
  lineId: number;
  ang: number;
  lineNo: number;
  gurmukhi: string;
  translations: { sourceCode: string; body: string }[];
  words: PassageWord[];
  phrases: PassagePhrase[];
  /** This line's pad-arth entries that fit no word of the passage. */
  padarthUnplaced: PadarthEntry[];
  /** Pad-arth text before its first entry. */
  padarthLeading: string[];
  padarthRaw: string | null;
};

export type PadarthPassage = { lines: PassageLine[] };

type DefinitionRow = { source: string; senseNumber: number; text: string; textEn: string | null };

export type AssembleInput = {
  /** In reading order. */
  lines: { id: number; ang: number; lineNo: number; gurmukhi: string }[];
  occurrences: { lineId: number; position: number; wordId: number; gurmukhi: string }[];
  /** Senses for the passage's words and for their base forms. */
  definitions: (DefinitionRow & { wordId: number })[];
  /** Senses of multi-word headwords (ਓਤਿ ਪੋਤਿ), matched against each line. */
  phraseDefinitions: (DefinitionRow & { headword: string })[];
  baseForms: { wordId: number; base: string; baseWordId: number; basis: string }[];
  grammar: (GrammarFact & { wordId: number })[];
  /** Includes the ss_padarth rows, which are parsed rather than listed. */
  translations: { lineId: number; sourceCode: string; body: string }[];
  dictSourceOrder: string[];
  translationOrder: string[];
};

function groupBy<T, K>(rows: T[], key: (r: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const r of rows) {
    const k = key(r);
    const list = out.get(k);
    if (list) list.push(r);
    else out.set(k, [r]);
  }
  return out;
}

/** Ranks codes by a preferred order, then the rest as first seen. */
function ordered(codes: string[], preferred: string[]): string[] {
  const seen = [...new Set(codes)];
  const rank = (c: string) => {
    const i = preferred.indexOf(c);
    return i >= 0 ? i : preferred.length + seen.indexOf(c);
  };
  return seen.sort((a, b) => rank(a) - rank(b));
}

function toSenses(rows: DefinitionRow[]): Sense[] {
  return [...rows]
    .sort((a, b) => a.senseNumber - b.senseNumber)
    .map(({ senseNumber, text, textEn }) => ({ senseNumber, text, textEn }));
}

function directGroups(rows: DefinitionRow[], sourceOrder: string[]): GlossGroup[] {
  const bySource = groupBy(rows, (r) => r.source);
  return ordered([...bySource.keys()], sourceOrder).map((source) => ({
    source,
    via: null,
    senses: toSenses(bySource.get(source)!),
  }));
}

function phraseText(tokens: string[], positions: number[]): string {
  return positions
    .map((p, i) => (i > 0 && p !== positions[i - 1] + 1 ? `… ${tokens[p]}` : tokens[p]))
    .join(" ");
}

export function assemblePassage(input: AssembleInput): PadarthPassage {
  const occByLine = groupBy(input.occurrences, (o) => o.lineId);
  const defsByWord = groupBy(input.definitions, (d) => d.wordId);
  const basesByWord = groupBy(input.baseForms, (b) => b.wordId);
  const grammarByWord = groupBy(input.grammar, (g) => g.wordId);
  const translationsByLine = groupBy(input.translations, (t) => t.lineId);
  const phraseDefsByHeadword = groupBy(input.phraseDefinitions, (d) => d.headword);
  const allSources = [
    ...input.definitions.map((d) => d.source),
    ...input.phraseDefinitions.map((d) => d.source),
  ];
  const sourceOrder = ordered(allSources, input.dictSourceOrder);

  function wordGlosses(wordId: number): GlossGroup[] {
    const direct = directGroups(defsByWord.get(wordId) ?? [], sourceOrder);
    const groups: GlossGroup[] = [];
    for (const source of sourceOrder) {
      const own = direct.find((g) => g.source === source);
      if (own) {
        groups.push(own);
        continue;
      }
      for (const b of basesByWord.get(wordId) ?? []) {
        const rows = (defsByWord.get(b.baseWordId) ?? []).filter((d) => d.source === source);
        if (rows.length > 0) {
          groups.push({ source, via: { base: b.base, basis: b.basis }, senses: toSenses(rows) });
        }
      }
    }
    return groups;
  }

  // Per line: tokens in position order, then pad-arth parsed and aligned.
  const lines = input.lines.map((l) => {
    const occ = [...(occByLine.get(l.id) ?? [])].sort((a, b) => a.position - b.position);
    const tokens = occ.map((o) => o.gurmukhi);
    const padarthRow = (translationsByLine.get(l.id) ?? []).find((t) => t.sourceCode === PADARTH_SOURCE);
    const parsed = padarthRow ? parsePadarth(padarthRow.body) : { entries: [], leading: [] };
    return { line: l, occ, tokens, padarthRow, parsed };
  });

  // Pad-arth placements: [line index] → (entry, match, from line) list.
  type Placement = { entry: PadarthEntry; match: TermMatch; fromLineId: number };
  const placements: Placement[][] = lines.map(() => []);
  const unplaced: PadarthEntry[][] = lines.map(() => []);

  lines.forEach((l, i) => {
    const own = alignTerms(l.tokens, l.parsed.entries.map((e) => e.term));
    l.parsed.entries.forEach((entry, k) => {
      const m = own[k];
      if (m) {
        placements[i].push({ entry, match: m, fromLineId: l.line.id });
        return;
      }
      // BaniDB sometimes files a line's pad-arth on a neighbour (a heading,
      // or a whole pauri on one line): try the following lines, then earlier.
      const order = [
        ...lines.map((_, j) => j).filter((j) => j > i),
        ...lines.map((_, j) => j).filter((j) => j < i).reverse(),
      ];
      for (const j of order) {
        const [hit] = alignTerms(lines[j].tokens, [entry.term]);
        if (hit) {
          placements[j].push({ entry, match: hit, fromLineId: l.line.id });
          return;
        }
      }
      unplaced[i].push(entry);
    });
  });

  return {
    lines: lines.map((l, i) => {
      const toGloss = (p: Placement): PadarthGloss => ({
        ...p.entry,
        match: p.match.match,
        borrowedFromLineId: p.fromLineId === l.line.id ? null : p.fromLineId,
      });

      // Phrases keyed by their positions, so pad-arth and a dictionary
      // headword on the same words become one item.
      const phrases = new Map<string, PassagePhrase>();
      const phraseAt = (positions: number[]) => {
        const key = positions.join(",");
        if (!phrases.has(key)) {
          phrases.set(key, { positions, text: phraseText(l.tokens, positions), padarth: [], glosses: [] });
        }
        return phrases.get(key)!;
      };

      const wordPadarth = new Map<number, PadarthGloss[]>();
      for (const p of placements[i]) {
        if (p.match.positions.length === 1) {
          const at = p.match.positions[0];
          wordPadarth.set(at, [...(wordPadarth.get(at) ?? []), toGloss(p)]);
        } else {
          phraseAt(p.match.positions).padarth.push(toGloss(p));
        }
      }

      const headwords = [...phraseDefsByHeadword.keys()];
      alignTerms(l.tokens, headwords).forEach((m, k) => {
        if (m && m.match === "exact") {
          phraseAt(m.positions).glosses.push(...directGroups(phraseDefsByHeadword.get(headwords[k])!, sourceOrder));
        }
      });

      const phraseList = [...phrases.values()].sort(
        (a, b) => a.positions[0] - b.positions[0] || a.positions.length - b.positions.length
      );
      const inPhrase = new Set(phraseList.flatMap((p) => p.positions));

      const words: PassageWord[] = l.occ.map((o, at) => {
        const glosses = wordGlosses(o.wordId);
        const padarth = wordPadarth.get(at) ?? [];
        return {
          position: o.position,
          gurmukhi: o.gurmukhi,
          wordId: o.wordId,
          glosses,
          padarth,
          grammar: (grammarByWord.get(o.wordId) ?? []).map(({ wordId: _, ...g }) => g),
          covered: glosses.length > 0 || padarth.length > 0 || inPhrase.has(at),
        };
      });

      const translations = (translationsByLine.get(l.line.id) ?? []).filter((t) => t.sourceCode !== PADARTH_SOURCE);
      const translationCodes = ordered(translations.map((t) => t.sourceCode), input.translationOrder);

      return {
        lineId: l.line.id,
        ang: l.line.ang,
        lineNo: l.line.lineNo,
        gurmukhi: l.line.gurmukhi,
        translations: translationCodes.map((code) => {
          const t = translations.find((x) => x.sourceCode === code)!;
          return { sourceCode: t.sourceCode, body: t.body };
        }),
        words,
        phrases: phraseList,
        padarthUnplaced: unplaced[i],
        padarthLeading: l.parsed.leading,
        padarthRaw: l.padarthRow?.body ?? null,
      };
    }),
  };
}
