// Presentation rules for a definitions row on the word page.

/**
 * The English line to print under a definition, or null when it would only
 * repeat the definition text. Shackle stores its English in both columns
 * (#122); a source whose text is Punjabi (Mahan Kosh) would carry a distinct
 * English gloss here once one exists (#34).
 */
export function secondaryGloss(def: {
  definition_text: string;
  definition_en: string | null;
}): string | null {
  const en = def.definition_en?.trim();
  if (!en || en === def.definition_text.trim()) return null;
  return def.definition_en;
}
