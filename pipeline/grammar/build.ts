// word_grammar row builder.
//
// Combines the two grammar signals into candidate word_grammar rows:
//   - POS from the Mahan Kosh sense marker (parsePosFromDefinition)
//   - case/number from the surface form's final vowel (analyzeNounForm)
//
// The nominal form rules (case/number) are applied ONLY when the POS is nominal
// (noun/adjective/pronoun). A verb such as ਲਿਖਿ carries a sihari ending but must
// not be analyzed as an oblique noun, so its case/number stay null.

import { parsePosFromDefinition } from './pos';
import { analyzeNounForm } from './viakaran';

const NOMINAL_POS = new Set(['noun', 'adjective', 'pronoun']);

export interface GrammarRow {
  pos: string | null;
  gender: string | null;
  number: string | null;
  gram_case: string | null;
  rule_code: string | null;
  confidence: number | null;
  notes: string | null;
}

interface SenseLike {
  definition_text: string;
}

/**
 * Builds one word_grammar row per distinct POS attested across the word's senses.
 * For nominal POS the surface form is analyzed for case/number; other POS get a
 * POS-only row. Returns an empty array when no sense carries a recognized POS marker.
 */
export function buildGrammar(gurmukhi: string, senses: SenseLike[]): GrammarRow[] {
  const seen = new Set<string>();
  const rows: GrammarRow[] = [];

  for (const sense of senses) {
    const posResult = parsePosFromDefinition(sense.definition_text);
    if (!posResult) continue;
    if (seen.has(posResult.pos)) continue;
    seen.add(posResult.pos);

    if (NOMINAL_POS.has(posResult.pos)) {
      const form = analyzeNounForm(gurmukhi);
      // Combine POS and form confidence multiplicatively: the row is only as
      // trustworthy as its weaker signal.
      const confidence = Number((posResult.confidence * form.confidence).toFixed(3));
      rows.push({
        pos: posResult.pos,
        gender: null,
        number: form.number,
        gram_case: form.gram_case,
        rule_code: form.rule_code,
        confidence,
        notes: form.notes ?? null,
      });
    } else {
      rows.push({
        pos: posResult.pos,
        gender: null,
        number: null,
        gram_case: null,
        rule_code: null,
        confidence: posResult.confidence,
        notes: null,
      });
    }
  }

  return rows;
}
