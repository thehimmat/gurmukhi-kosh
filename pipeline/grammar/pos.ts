// Part-of-speech extraction from Mahan Kosh sense text.
//
// Mahan Kosh opens each sense with an abbreviated grammatical marker followed by
// a hyphen, e.g. "ਸੰਗ੍ਯਾ- …" (noun), "ਵਿ- …" (adjective). This module maps those
// markers to our normalized POS vocabulary. It is deliberately conservative:
// only well-attested markers are recognized, and intro words that look like
// markers but are not POS (notably ਭਾਵ, which introduces a figurative gloss)
// are excluded.

// Marker → normalized POS. Includes spelling variants (subjoined vs plain ਯ).
const POS_MARKERS: Record<string, string> = {
  ਸੰਗ੍ਯਾ: 'noun', // saṅgyā
  ਸੰਗਯਾ: 'noun', // saṅgyā (un-subjoined variant)
  ਵਿ: 'adjective', // visheshan
  ਸਰਵ: 'pronoun', // sarvanām
  ਵ੍ਯ: 'particle', // avyaya (indeclinable)
  ਵਯ: 'particle', // avyaya (un-subjoined variant)
  ਕ੍ਰਿ: 'verb', // kriyā
  ਕ੍ਰਿਯਾ: 'verb', // kriyā (full form)
};

export interface PosResult {
  pos: string;
  marker: string;
  confidence: number;
}

// A POS marker is a known abbreviation written as a standalone token followed by
// a hyphen ("…ਸੰਗ੍ਯਾ- …"). It may not lead the sense: Mahan Kosh often redirects
// an inflected form first ("ਦੇਖੋ, ਸਚ. ਸੰਗ੍ਯਾ- …"), so we scan for the earliest
// known marker rather than only inspecting the leading token. Requiring a
// non-Gurmukhi boundary before the marker and a hyphen after keeps this precise.
const GURMUKHI = '਀-੿';

/**
 * Returns the part of speech implied by the earliest Mahan Kosh POS marker in the
 * sense, or null if none is present. A pure redirect such as "ਦੇਖੋ, ਨਾਮ." (no
 * marker on the surface form) yields null.
 */
export function parsePosFromDefinition(definitionText: string): PosResult | null {
  const text = definitionText.trim();

  let best: { pos: string; marker: string; index: number } | null = null;
  for (const [marker, pos] of Object.entries(POS_MARKERS)) {
    const re = new RegExp(`(?:^|[^${GURMUKHI}])(${marker})-`);
    const m = re.exec(text);
    if (!m) continue;
    const index = m.index + m[0].indexOf(marker);
    if (!best || index < best.index) best = { pos, marker, index };
  }

  if (!best) return null;
  return { pos: best.pos, marker: best.marker, confidence: 0.9 };
}
