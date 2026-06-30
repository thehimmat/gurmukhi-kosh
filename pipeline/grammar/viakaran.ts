// Gurbani Viakaran inflection analyzer (Sahib Singh's rule system).
//
// In classical Gurbani, the trailing vowel sign (laga/matra) on a noun encodes
// its kaarak (grammatical case). This module is a pure, deterministic rule
// engine: given a surface form it returns case/number features conditioned on
// the word being a noun. POS (noun vs verb vs particle) is decided elsewhere
// (from Mahan Kosh markers); this engine is only consulted for nominal forms.
//
// Each result carries a `rule_code` and a `confidence` so the ingest layer can
// store provenance and a reviewer can audit or override low-confidence guesses.

// Gurmukhi vowel signs (dependent matras) — U+0A3E..U+0A4C
const VOWEL_SIGNS = new Set([
  'ਾ', // ਾ kanna
  'ਿ', // ਿ sihari
  'ੀ', // ੀ bihari
  'ੁ', // ੁ aunkar
  'ੂ', // ੂ dulankar
  'ੇ', // ੇ lavan
  'ੈ', // ੈ dulavan
  'ੋ', // ੋ hora
  'ੌ', // ੌ kanaura
]);

// Marks that may trail the actual vowel and should be skipped when locating it.
const TRAILING_MARKS = new Set([
  'ਂ', // ਂ bindi (nasalization)
  'ੰ', // ੰ tippi (nasalization)
  'ੱ', // ੱ addak (gemination)
  '਼', // ਼ nukta
  '੍', // ੍ halant/virama
]);

/**
 * Returns the vowel sign (matra) borne by the final syllable, or null if the
 * form ends mukta (bare consonant, no dependent vowel). Trailing nasal/gemination
 * marks are skipped so e.g. ਜਿਨੀਂ resolves to its bihari (ੀ).
 */
export function finalVowel(gurmukhi: string): string | null {
  const chars = Array.from(gurmukhi.trim());
  for (let i = chars.length - 1; i >= 0; i--) {
    const ch = chars[i];
    if (TRAILING_MARKS.has(ch)) continue;
    if (VOWEL_SIGNS.has(ch)) return ch;
    // First non-mark character is a consonant/independent vowel: form is mukta.
    return null;
  }
  return null;
}

/**
 * Returns the consonant stem of a form by stripping its final vowel sign and any
 * trailing nasal/gemination marks. Internal vowels are preserved. Inflected forms
 * of one lexeme share a stem (ਹੁਕਮੁ / ਹੁਕਮਿ / ਹੁਕਮ → ਹੁਕਮ).
 */
export function stem(gurmukhi: string): string {
  const chars = Array.from(gurmukhi.trim());
  while (chars.length && TRAILING_MARKS.has(chars[chars.length - 1])) chars.pop();
  if (chars.length && VOWEL_SIGNS.has(chars[chars.length - 1])) chars.pop();
  return chars.join('');
}

export interface FormAnalysis {
  gram_case: string | null; // 'nominative' | 'oblique' | 'vocative' | null
  number: string | null; // 'singular' | 'plural' | null
  gender: string | null; // 'masculine' | 'feminine' | null
  rule_code: string | null;
  confidence: number; // 0..1
  notes?: string;
}

const UNDECIDED: FormAnalysis = {
  gram_case: null,
  number: null,
  gender: null,
  rule_code: null,
  confidence: 0.2,
  notes: 'No high-confidence Viakaran rule matched this ending.',
};

/**
 * Analyzes a nominal surface form, inferring case/number from its final vowel
 * per Sahib Singh's Viakaran. Only encodes the highest-confidence rules; genuinely
 * ambiguous endings (e.g. kanna) return a low-confidence undecided result rather
 * than guessing.
 */
export function analyzeNounForm(gurmukhi: string): FormAnalysis {
  const vowel = finalVowel(gurmukhi);

  switch (vowel) {
    case 'ੁ': // ੁ aunkar → nominative (kartaa kaarak) singular masc.
      // The aunkar-ending nominative singular is the canonical masculine noun
      // form, so gender is reliably masculine here. Other endings are ambiguous
      // for gender (Mahan Kosh carries no gender marker in this corpus), so we
      // decline rather than guess.
      return {
        gram_case: 'nominative',
        number: 'singular',
        gender: 'masculine',
        rule_code: 'AUNKAR_NOM_SG',
        confidence: 0.85,
        notes: 'Final aunkar marks the nominative singular of a masculine noun.',
      };

    case 'ਿ': // ਿ sihari → oblique (karan/adhikaran kaarak) singular.
      return {
        gram_case: 'oblique',
        number: 'singular',
        gender: null,
        rule_code: 'SIHARI_OBL_SG',
        confidence: 0.8,
        notes: 'Final sihari marks an oblique singular (instrumental/locative sense).',
      };

    case null: // mukta → oblique singular, typically before a postposition.
      return {
        gram_case: 'oblique',
        number: 'singular',
        gender: null,
        rule_code: 'MUKTA_OBL_SG',
        confidence: 0.7,
        notes: 'Mukta (bare) form is oblique singular, often preceding a sambandhak.',
      };

    default:
      return { ...UNDECIDED };
  }
}

export interface VerbAnalysis {
  verb_form: string | null; // 'infinitive' | 'verbal noun' | null
  rule_code: string | null;
  confidence: number;
  notes?: string;
}

const NOT_A_VERB_FORM: VerbAnalysis = {
  verb_form: null,
  rule_code: null,
  confidence: 0.2,
  notes: 'No high-confidence non-finite verb ending matched.',
};

/**
 * Classifies a NON-FINITE verb form from its ending (Sahib Singh's Viakaran kriya
 * morphology). Only the unambiguous ਣ/ਨ-stem forms are recognized — the
 * infinitive (-ਣਾ/-ਨਾ, "to do") and the verbal noun (-ਣੁ/-ਨੁ/-ਣੇ/-ਨੇ/-ਣੈ/-ਨੈ,
 * "the act of doing"). Anything else (finite endings, bare conjunctives) returns
 * a low-confidence decline rather than guessing. Consulted only for verb POS.
 */
export function analyzeVerbForm(gurmukhi: string): VerbAnalysis {
  const g = gurmukhi.trim();
  if (/(ਣਾ|ਨਾ)$/.test(g)) {
    return {
      verb_form: 'infinitive',
      rule_code: 'VERB_INFINITIVE',
      confidence: 0.8,
      notes: 'The -ਣਾ/-ਨਾ ending marks the infinitive (the "to ___" form of the verb).',
    };
  }
  if (/(ਣੁ|ਨੁ|ਣੇ|ਨੇ|ਣੈ|ਨੈ)$/.test(g)) {
    return {
      verb_form: 'verbal noun',
      rule_code: 'VERB_VERBAL_NOUN',
      confidence: 0.7,
      notes: 'The -ਣੁ/-ਨੁ (and oblique -ਣੇ/-ਣੈ) ending marks a verbal noun (the act of the verb).',
    };
  }
  return { ...NOT_A_VERB_FORM };
}
