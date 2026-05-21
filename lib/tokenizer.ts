// Gurmukhi Unicode block: U+0A00–U+0A7F
// We filter to tokens that contain at least one Gurmukhi letter/vowel
// and are not purely punctuation or number tokens.

const GURMUKHI_LETTER_RE = /[ਅ-ਹਾ-ੌੴ]/;

// Tokens to discard entirely
const DISCARD = new Set([
  "॥", // double danda U+0965
  "।", // danda U+0964
  "|",
  "||",
  "~",
]);

// Remove trailing dandas/pipes from a token
function normalizeToken(token: string): string {
  return token.replace(/[।॥|~]+$/, "").replace(/^[।॥|~]+/, "").trim();
}

export function tokenize(unicodeText: string): string[] {
  const raw = unicodeText.split(/\s+/);
  const result: string[] = [];

  for (const raw_token of raw) {
    const token = normalizeToken(raw_token);
    if (!token) continue;
    if (DISCARD.has(token)) continue;
    // Must contain at least one Gurmukhi letter/vowel carrier
    if (!GURMUKHI_LETTER_RE.test(token)) continue;
    result.push(token);
  }

  return result;
}
