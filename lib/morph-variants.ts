// Related forms of a word, from word_forms memberships a source asserts.
//
// Pure (no Supabase client) so it unit-tests without a database. The label is
// the source's own wording (word_forms.label_raw, e.g. Shackle's "pres. 3s.");
// nothing is derived from a form's ending (#56), and a membership with no
// source_code is ignored (the retired stem grouping, archived by migration 037).

export type SiblingFormRow = {
  source_code: string | null;
  label_raw: string | null;
  words: { gurmukhi: string } | null;
};

export type MorphVariant = {
  gurmukhi: string;
  label: string | null;
  sourceCode: string;
};

export function toMorphVariants(rows: SiblingFormRow[], word: string): MorphVariant[] {
  const byForm = new Map<string, MorphVariant>();
  for (const r of rows) {
    const g = r.words?.gurmukhi;
    if (!g || g === word || !r.source_code || byForm.has(g)) continue;
    byForm.set(g, { gurmukhi: g, label: r.label_raw, sourceCode: r.source_code });
  }
  return [...byForm.values()];
}
