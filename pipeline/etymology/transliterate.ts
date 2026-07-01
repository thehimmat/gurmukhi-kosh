// Thin wrapper around @indic-transliteration/sanscript, isolating the two
// schemes this pipeline needs: IAST for display (root_form_roman, readable to
// a general reader) and SLP1 for querying the Monier-Williams API (whose
// headword_slp1 field is indexed in that ASCII scheme, not Devanagari).

import sanscriptDefault from "@indic-transliteration/sanscript";

// The package's CJS/ESM interop under tsx sometimes lands the real object on
// .default and sometimes not — normalize once here rather than in every caller.
const sanscript = (sanscriptDefault as unknown as { t?: unknown }).t
  ? sanscriptDefault
  : (sanscriptDefault as unknown as { default: typeof sanscriptDefault }).default;

export function devanagariToIAST(text: string): string {
  return sanscript.t(text, "devanagari", "iast");
}

export function devanagariToSLP1(text: string): string {
  return sanscript.t(text, "devanagari", "slp1");
}
