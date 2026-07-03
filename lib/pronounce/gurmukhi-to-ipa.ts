/**
 * Gurmukhi → display IPA.
 *
 * Vendored from gurmukhi-voice-search's converter, but kept SEPARATE on purpose:
 * voice-search owns words.phonetic_ipa, a deliberately lossy *fuzzy-match key*
 * (it collapses length, tone, retroflex/dental, nasals). This module instead
 * produces faithful IPA for display in words.ipa_display, with an option to drop
 * the final inherent schwa (Gurbani recitation usually leaves a final mukta
 * consonant unvoiced). Pronunciation output is rule_derived and expected to be
 * refined via gurmukhi-rule-builder.
 */

import rulesJson from "./rules.json";

type Rules = typeof rulesJson;
const rules = rulesJson as Rules;

const VOWEL_DIACRITICS = new Set(["ਾ", "ਿ", "ੀ", "ੁ", "ੂ", "ੇ", "ੈ", "ੋ", "ੌ"]);
const NASALS = new Set(["ਂ", "ੰ"]);
const ADDAK = "ੱ"; // gemination mark
const VIRAMA = "੍"; // halant / virama
const INHERENT_VOWEL = "ə";

function getIPA(char: string): string {
  return (rules.primitives as Record<string, string>)[char] ?? "";
}

function getPlaceOfArticulation(char: string): string {
  return (rules.placeOfArticulation as Record<string, string>)[char] ?? "dental";
}

function resolveNasal(nextConsonant: string | null): string {
  if (!nextConsonant) return "n̪";
  const place = getPlaceOfArticulation(nextConsonant);
  return (rules.nasalResolution as Record<string, string>)[place] ?? "n̪";
}

export interface IpaOptions {
  /** Keep the trailing inherent schwa on a final bare consonant. Default false (display). */
  finalSchwa?: boolean;
}

/**
 * Convert a single Gurmukhi word to faithful display IPA.
 * Handles consonant+vowel clusters, inherent vowel, nasalization, gemination
 * (addak), and virama (consonant clusters). Does NOT model tone.
 */
export function gurmukhiToDisplayIPA(word: string, opts: IpaOptions = {}): string {
  const chars = [...word];
  let result = "";
  let i = 0;

  while (i < chars.length) {
    const ch = chars[i];
    const next = chars[i + 1] ?? null;

    if (ch === ADDAK) {
      if (next) result += getIPA(next);
      i++;
      continue;
    }

    if (ch === VIRAMA) {
      i++;
      continue;
    }

    if (NASALS.has(ch)) {
      result += resolveNasal(next);
      i++;
      continue;
    }

    if (VOWEL_DIACRITICS.has(ch)) {
      result += getIPA(ch);
      i++;
      continue;
    }

    const overrides = rules.overrides as Record<string, string>;
    if (next && overrides[ch + next]) {
      result += overrides[ch + next];
      i += 2;
      continue;
    }

    const consonantIPA = getIPA(ch);
    result += consonantIPA;

    if (next && VOWEL_DIACRITICS.has(next)) {
      result += getIPA(next);
      i += 2;
      const afterVowel = chars[i] ?? null;
      if (afterVowel && NASALS.has(afterVowel)) {
        result += resolveNasal(chars[i + 1] ?? null);
        i++;
      }
      continue;
    }

    if (next === VIRAMA) {
      i += 2;
      continue;
    }

    if (consonantIPA !== "") {
      result += INHERENT_VOWEL;
    }
    i++;
  }

  // Drop the trailing inherent schwa for display unless explicitly requested.
  if (!opts.finalSchwa && result.endsWith(INHERENT_VOWEL)) {
    result = result.slice(0, -INHERENT_VOWEL.length);
  }
  return result;
}
