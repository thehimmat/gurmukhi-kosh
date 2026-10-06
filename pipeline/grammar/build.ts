// word_grammar rows from Mahan Kosh.
//
// The only grammar this pipeline writes is what Mahan Kosh itself states: the
// part of speech read from each sense's own marker (parsePosFromDefinition).
// Case, number, gender and verb form are never inferred from a word's spelling;
// those come only from sources that state them (Sahib Singh's pad-arth, Shackle)
// and are absent otherwise. The Viakaran ending rules that used to fill them
// were retired because an ending alone underdetermines the reading (#21, #27,
// #54, #117); their output is archived by migration 037.

import { parsePosFromDefinition } from './pos';

export interface MahanKoshGrammarRow {
  pos: string;
  provenance: 'scraped';
  source_code: 'mahan_kosh';
}

interface SenseLike {
  definition_text: string;
}

/**
 * One row per distinct POS marker across the word's senses, in sense order.
 * A sense with no marker (including a pure ਦੇਖੋ redirect) contributes nothing.
 */
export function mahanKoshGrammarRows(senses: SenseLike[]): MahanKoshGrammarRow[] {
  const seen = new Set<string>();
  const rows: MahanKoshGrammarRow[] = [];
  for (const sense of senses) {
    const pos = parsePosFromDefinition(sense.definition_text)?.pos;
    if (!pos || seen.has(pos)) continue;
    seen.add(pos);
    rows.push({ pos, provenance: 'scraped', source_code: 'mahan_kosh' });
  }
  return rows;
}
