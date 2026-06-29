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

// Strip an optional leading Gurmukhi/Arabic sense number and surrounding
// whitespace/punctuation so "੨. ਸੰਗ੍ਯਾ- …" resolves the same as "ਸੰਗ੍ਯਾ- …".
const LEADING_NUMBER_RE = /^[\s੦-੯0-9]+[.)\s]+/;

/**
 * Returns the part of speech implied by a Mahan Kosh sense's leading marker,
 * or null if the sense has no recognized POS marker.
 */
export function parsePosFromDefinition(definitionText: string): PosResult | null {
  const text = definitionText.trim().replace(LEADING_NUMBER_RE, '');
  const dash = text.indexOf('-');
  if (dash <= 0) return null;

  const marker = text.slice(0, dash).trim();
  const pos = POS_MARKERS[marker];
  if (!pos) return null;

  return { pos, marker, confidence: 0.9 };
}
