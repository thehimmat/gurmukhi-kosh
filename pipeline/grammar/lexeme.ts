// Lexeme grouping.
//
// Inflected forms of one lexeme share a consonant stem and differ only in their
// final vowel (the kaarak ending). Grouping surface forms by stem reconstructs
// the lexeme and its member forms, which fills the "Related forms" panel.

import { stem, analyzeNounForm } from './viakaran';

export interface LexemeForm {
  gurmukhi: string;
  inflection_desc: string | null;
}

export interface LexemeGroup {
  stem: string;
  forms: LexemeForm[];
}

// Builds a short inflection label from the Viakaran analysis, e.g. "nominative
// singular", or null when the form's ending is undecided.
function inflectionDesc(gurmukhi: string): string | null {
  const a = analyzeNounForm(gurmukhi);
  if (!a.gram_case && !a.number) return null;
  return [a.gram_case, a.number].filter(Boolean).join(' ') || null;
}

/**
 * Groups surface forms into lexemes by shared stem. Repeated forms are
 * de-duplicated, and singletons are dropped (a lexeme needs at least two related
 * forms to be worth surfacing). Insertion order of stems is preserved.
 */
export function groupLexemes(forms: string[]): LexemeGroup[] {
  const byStem = new Map<string, Set<string>>();

  for (const form of forms) {
    const key = stem(form);
    if (!key) continue;
    if (!byStem.has(key)) byStem.set(key, new Set());
    byStem.get(key)!.add(form);
  }

  const groups: LexemeGroup[] = [];
  for (const [key, formSet] of byStem) {
    if (formSet.size < 2) continue;
    groups.push({
      stem: key,
      forms: Array.from(formSet).map((g) => ({
        gurmukhi: g,
        inflection_desc: inflectionDesc(g),
      })),
    });
  }

  return groups;
}
