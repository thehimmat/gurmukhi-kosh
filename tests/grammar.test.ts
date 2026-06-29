import { describe, it, expect } from 'vitest';
import { finalVowel, analyzeNounForm } from '../pipeline/grammar/viakaran';

// Sahib Singh's Gurbani Viakaran: the trailing vowel sign (laga/matra) on a
// noun in Gurbani encodes its kaarak (case). These golden cases use textbook
// Japji examples. Expected case/number values follow Sahib Singh's Darpan
// analyses and should be re-verified against that source before trusting at scale.

describe('viakaran', () => {
  describe('finalVowel', () => {
    it('returns aunkar (ੁ) for ਨਾਮੁ', () => {
      expect(finalVowel('ਨਾਮੁ')).toBe('ੁ'); // ੁ
    });

    it('returns sihari (ਿ) for ਹੁਕਮਿ', () => {
      expect(finalVowel('ਹੁਕਮਿ')).toBe('ਿ'); // ਿ
    });

    it('returns null (mukta) for ਗੁਰ', () => {
      expect(finalVowel('ਗੁਰ')).toBeNull();
    });

    it('ignores a trailing bindi/tippi nasal mark when finding the vowel', () => {
      // ਜਿਨੀਂ — bihari (ੀ) carrying a bindi: the vowel is still ੀ
      expect(finalVowel('ਜਿਨੀਂ')).toBe('ੀ'); // ੀ
    });
  });

  describe('analyzeNounForm', () => {
    it('ਨਾਮੁ (aunkar) → nominative singular', () => {
      const a = analyzeNounForm('ਨਾਮੁ');
      expect(a.gram_case).toBe('nominative');
      expect(a.number).toBe('singular');
      expect(a.rule_code).toBe('AUNKAR_NOM_SG');
      expect(a.confidence).toBeGreaterThan(0.7);
    });

    it('ਹੁਕਮੁ (aunkar) → nominative singular', () => {
      const a = analyzeNounForm('ਹੁਕਮੁ');
      expect(a.gram_case).toBe('nominative');
      expect(a.number).toBe('singular');
      expect(a.rule_code).toBe('AUNKAR_NOM_SG');
    });

    it('ਹੁਕਮਿ (sihari) → oblique singular', () => {
      const a = analyzeNounForm('ਹੁਕਮਿ');
      expect(a.gram_case).toBe('oblique');
      expect(a.number).toBe('singular');
      expect(a.rule_code).toBe('SIHARI_OBL_SG');
    });

    it('ਗੁਰ (mukta) → oblique singular', () => {
      const a = analyzeNounForm('ਗੁਰ');
      expect(a.gram_case).toBe('oblique');
      expect(a.number).toBe('singular');
      expect(a.rule_code).toBe('MUKTA_OBL_SG');
    });

    it('returns a low-confidence null analysis for an ambiguous ending', () => {
      // ਾ (kanna) ending is genuinely ambiguous across genders/cases — engine
      // should decline rather than guess.
      const a = analyzeNounForm('ਰਾਜਾ');
      expect(a.gram_case).toBeNull();
      expect(a.confidence).toBeLessThan(0.5);
    });
  });
});
