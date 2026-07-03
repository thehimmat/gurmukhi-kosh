import { describe, it, expect } from 'vitest';
import { extractEtymologyCandidate, extractDevanagariRoot } from '../pipeline/etymology/parse';

// Golden cases are real Mahan Kosh definition rows pulled from the DB (see
// select ... where cross_refs->>'origin_lang' is not null), covering both the
// "root given in Devanagari" and "marker only, no Devanagari" shapes.

describe('extractEtymologyCandidate', () => {
  it('Sanskrit with Devanagari root given (ਗੁਰੂ)', () => {
    const r = extractEtymologyCandidate(
      'ਸੰ. गुरू ਗੁਰੂ. ਸੰਗ੍ਯਾ- ਇਹ ਸ਼ਬਦ ਗ੍ਰੀ (गृ) ਧਾਤੁ ਤੋਂ ਬਣਿਆ ਹੈ',
      { origin_lang: 'sa' }
    );
    expect(r?.origin_language).toBe('Sanskrit');
    expect(r?.root_form).toBe('गुरू');
  });

  it('Sanskrit root given mid-sentence, after a sense number (ਗੁਰ)', () => {
    const r = extractEtymologyCandidate(
      '੨. ਸੰ. गुर ਧਾ- ਯਤਨ ਕਰਨਾ, ਉੱਦਮ ਕਰਨਾ',
      { origin_lang: 'sa' }
    );
    expect(r?.root_form).toBe('गुर');
  });

  it('Sanskrit marker with no Devanagari (paraphrased in Gurmukhi only) → null root', () => {
    const r = extractEtymologyCandidate('ਸੰ. ਪੁਰੁਸ. ਸੰਗ੍ਯਾ- ਮਨੁੱਖ. ਆਦਮੀ', { origin_lang: 'sa' });
    expect(r?.origin_language).toBe('Sanskrit');
    expect(r?.root_form).toBeNull();
  });

  it('Arabic: root_form comes straight from cross_refs.ar_fa, no text scan', () => {
    const r = extractEtymologyCandidate('ਅ਼. [سلامت] ਵਿ- ਕ਼ਾਇਮ. ਇਸਥਿਤ.', {
      origin_lang: 'ar',
      ar_fa: 'سلامت',
    });
    expect(r?.origin_language).toBe('Arabic');
    expect(r?.root_form).toBe('سلامت');
  });

  it('Persian: origin_lang fa maps to "Persian"', () => {
    const r = extractEtymologyCandidate('ਫ਼ਾ. [کار] ਜੰਗ.', { origin_lang: 'fa', ar_fa: 'کار' });
    expect(r?.origin_language).toBe('Persian');
    expect(r?.root_form).toBe('کار');
  });

  it('no cross_refs at all → null (not an etymology candidate)', () => {
    expect(extractEtymologyCandidate('ਸੰਗ੍ਯਾ- ਗੁੜ. ਸਿਆਹਕੰਦ.', null)).toBeNull();
  });

  it('cross_refs present but origin_lang missing (e.g. only ar_fa somehow) → null', () => {
    expect(extractEtymologyCandidate('text', {})).toBeNull();
  });

  it('Urdu ("ਉ.") without a corroborating script quote → null (weak single-char marker)', () => {
    // Real example: this Mahan Kosh row got tagged origin_lang='ur' purely from
    // a stray "ਉ." substring match, with no actual Urdu content in the text.
    const r = extractEtymologyCandidate(
      'ਸ਼ੀਲ. ਸਦਵ੍ਰਿੱਤਿ ਨੇਕ. ਐ਼ਮਾਲ. "ਵਿਣੁ ਗੁਣ ਕੀਤੇ ਭਗਤਿ ਨ ਹੋਇ." (ਜਪੁ)',
      { origin_lang: 'ur' }
    );
    expect(r).toBeNull();
  });

  it('Urdu WITH a corroborating script quote is accepted', () => {
    const r = extractEtymologyCandidate('ਉ. [ناہی] ਵਰਜਣ ਵਾਲਾ.', { origin_lang: 'ur', ar_fa: 'ناہی' });
    expect(r?.origin_language).toBe('Urdu');
    expect(r?.root_form).toBe('ناہی');
  });
});

describe('extractDevanagariRoot', () => {
  it('captures a run with a virama (ਪ੍ਰਸਾਦਿਨ੍ example)', () => {
    expect(extractDevanagariRoot('੨. ਸੰ. प्रसादिन्. ਵਿ- ਕ੍ਰਿਪਾ ਕਰਨ ਵਾਲਾ.', 'ਸੰ.')).toBe('प्रसादिन्');
  });

  it('returns null when the marker itself is absent', () => {
    expect(extractDevanagariRoot('ਸੰਗ੍ਯਾ- ਮਿਰਚ', 'ਸੰ.')).toBeNull();
  });

  it('stops at the trailing ASCII period, not part of the Devanagari run', () => {
    expect(extractDevanagariRoot('ਸੰ. हय ਹਯ. ਘੋੜਾ.', 'ਸੰ.')).toBe('हय');
  });
});
