// Presenting Shackle glossary rows on the word page (#131).

/**
 * Split a Shackle gloss from the detail printed after it. Shackle prints
 * 'gloss': phrases, citations…; the OCR dropped the opening quote, leaving
 * gloss': … in 329 rows. The detail is real (phrases, citations, notes on
 * commentaries), so it is kept, just shown apart from the gloss.
 */
export function splitShackleGloss(text: string): { gloss: string; detail: string | null } {
  // The closing quote is the first ' followed by ':', ';', '(' or the end;
  // an apostrophe inside a word (God's, one's) is followed by a letter.
  const m = text.match(/^(.*?)'(?=\s*[:;(]|\s*$)/);
  if (!m) return { gloss: text, detail: null };
  const detail = text.slice(m[0].length).replace(/^\s*:\s*/, "").trim();
  return { gloss: m[1].trim(), detail: detail || null };
}

/** Gurmukhi entries a Shackle row points to, as resolved by the ingest. */
export function seeTargets(crossRefs: Record<string, unknown> | null | undefined): string[] {
  const see = crossRefs?.see;
  return Array.isArray(see) ? see.filter((t): t is string => typeof t === "string") : [];
}

const SUPERSCRIPT = "⁰¹²³⁴⁵⁶⁷⁸⁹";

/** A homograph index as printed by Shackle: 1 → ¹. */
export function homographMark(n: number): string {
  return String(n).replace(/\d/g, (d) => SUPERSCRIPT[Number(d)]);
}
