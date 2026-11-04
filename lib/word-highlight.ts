/**
 * Where a word stands in a line as a whole word, for the word page's
 * occurrence highlight. Marking the first match anywhere (indexOf) cut longer
 * words in two: ਮਨ inside ਮਨਿ left ਿ in its own text run, which the browser
 * draws on a dotted circle (#347). A match counts only between word boundaries
 * (start, end, whitespace, dandas), so it never ends mid-letter.
 */
const BOUNDARY = /[\s।॥|~,.;:!?'"()]/;

export function wordSpan(text: string, word: string): { start: number; end: number } | null {
  if (!word) return null;
  for (let i = text.indexOf(word); i !== -1; i = text.indexOf(word, i + 1)) {
    const end = i + word.length;
    const before = i === 0 || BOUNDARY.test(text[i - 1]);
    const after = end === text.length || BOUNDARY.test(text[end]);
    if (before && after) return { start: i, end };
  }
  return null;
}
