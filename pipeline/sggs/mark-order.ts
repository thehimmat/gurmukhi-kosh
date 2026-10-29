/**
 * BaniDB stores some nasal marks before the aunkar or dulainkar: ਨੰੂ for ਨੂੰ, ਸਮੰੁਦ੍ਰ for ਸਮੁੰਦ੍ਰ (#310).
 * That is the legacy-font conversion's order, not Unicode's; it renders the same, but the stored words
 * differ, so word counts, search and the dictionary split them. The ingest puts the marks in Unicode
 * order for every line, and migration 079 did the same for the copy already loaded.
 *
 * The transliteration was generated from the misordered text (ਨੰੂ → na(n)oo), so the words fixed
 * here get BaniDB's own transliteration of the right spelling (ਨੂੰ → noo(n)).
 */

const MISORDERED = /([ੰਂ])([ੁੂ])/g;
// ੳ + ੁ or ੂ, which the reorder can leave, is the vowel letter ਉ or ਊ.
const OORA = [/ੳੁ/g, /ੳੂ/g] as const;

function fixWord(word: string): string {
  return word.replace(MISORDERED, "$2$1").replace(OORA[0], "ਉ").replace(OORA[1], "ਊ");
}

// na(n)oo → noo(n), sama(n)udhr → samu(n)dhr, galaha(n) → galahu(n) (final ੰੁ).
function fixTransliteration(token: string, before: string): string {
  if (token.includes("a(n)oo")) return token.replace("a(n)oo", "oo(n)");
  if (token.includes("a(n)u")) return token.replace("a(n)u", "u(n)");
  if (/[ੰਂ]ੁ$/.test(before.replace(/[॥੦-੯]+$/, "")) && /a\(n\)$/.test(token)) return token.replace(/a\(n\)$/, "u(n)");
  return token;
}

export type MarkOrderFix = { gurmukhi: string; transliteration: string | null; changed: boolean };

/** The line with its nasal marks in Unicode order, and its transliteration to match. */
export function fixMarkOrder(gurmukhi: string, transliteration: string | null): MarkOrderFix {
  if (!/[ੰਂ][ੁੂ]/.test(gurmukhi)) return { gurmukhi, transliteration, changed: false };
  const words = gurmukhi.split(" ");
  const fixed = words.map(fixWord);
  const tokens = transliteration?.split(" ");
  const aligned = tokens && tokens.length === words.length;
  return {
    gurmukhi: fixed.join(" "),
    transliteration: aligned
      ? tokens.map((t, i) => (fixed[i] === words[i] ? t : fixTransliteration(t, words[i]))).join(" ")
      : transliteration,
    changed: true,
  };
}
