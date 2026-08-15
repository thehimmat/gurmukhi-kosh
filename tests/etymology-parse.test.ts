import { describe, it, expect } from 'vitest';
import { extractEtymologyCandidates, type ParsedOrigin } from '../pipeline/etymology/parse';

const TEXT = 'ਸੰ. गुरू ਸੰਗ੍ਯਾ- ...';

const origin = (p: Partial<ParsedOrigin>): ParsedOrigin => ({
  marker: 'ਸੰ.',
  language: 'Sanskrit',
  iso639: 'sa',
  etymon: null,
  ...p,
});

describe('extractEtymologyCandidates', () => {
  it('maps a Sanskrit origin with a printed Devanagari etymon', () => {
    const [r] = extractEtymologyCandidates(TEXT, [
      origin({ etymon: { text: 'गुरू', script: 'devanagari' } }),
    ]);
    expect(r).toEqual({
      origin_language: 'Sanskrit',
      root_form: 'गुरू',
      root_script: 'devanagari',
      source_text: TEXT,
    });
  });

  it('keeps the origin claim but no root when only a Gurmukhi transcription exists', () => {
    // The parser flags Gurmukhi etymons inferred: our transcription, not
    // Kahn Singh's print — it must never be presented as the printed form.
    const [r] = extractEtymologyCandidates(TEXT, [
      origin({ etymon: { text: 'ਕ੍ਸ਼ੇਮ', script: 'gurmukhi', inferred: true } }),
    ]);
    expect(r.origin_language).toBe('Sanskrit');
    expect(r.root_form).toBeNull();
    expect(r.root_script).toBeNull();
  });

  it('maps a Perso-Arabic bracketed etymon', () => {
    const [r] = extractEtymologyCandidates('ਅ਼. [سلامت] ਵਿ- ਕ਼ਾਇਮ.', [
      origin({ marker: 'ਅ਼.', language: 'Arabic', iso639: 'ar', etymon: { text: 'سلامت', script: 'perso_arabic' } }),
    ]);
    expect(r.origin_language).toBe('Arabic');
    expect(r.root_form).toBe('سلامت');
    expect(r.root_script).toBe('perso_arabic');
  });

  it('produces one candidate per origin, in print order (#48 chains)', () => {
    const rs = extractEtymologyCandidates('ਫ਼ਾ. [سیب] ... ਅੰ. Apple.', [
      origin({ marker: 'ਫ਼ਾ.', language: 'Persian', iso639: 'fa', etymon: { text: 'سیب', script: 'perso_arabic' } }),
      origin({ marker: 'ਅੰ.', language: 'English', iso639: 'en', etymon: { text: 'Apple. L. Pyrusmarus', script: 'latin' } }),
    ]);
    expect(rs.map((r) => r.origin_language)).toEqual(['Persian', 'English']);
    expect(rs[0].root_form).toBe('سیب');
    expect(rs[1].root_form).toBe('Apple. L. Pyrusmarus');
    expect(rs[1].root_script).toBe('latin');
  });

  it('prefers the canonical ISO display name over a verbose parser name', () => {
    const [r] = extractEtymologyCandidates(TEXT, [
      origin({ marker: 'ਵ੍ਰਜ.', language: 'Braj Bhasha', iso639: 'bra' }),
    ]);
    expect(r.origin_language).toBe('Braj');
  });

  it('falls back to the parser name for ISO-less markers', () => {
    const [r] = extractEtymologyCandidates(TEXT, [
      origin({ marker: 'ਪਹਾ.', language: 'Pahari (hill dialects)', iso639: null }),
    ]);
    expect(r.origin_language).toBe('Pahari (hill dialects)');
  });

  it('returns [] for missing or empty origin lists', () => {
    expect(extractEtymologyCandidates(TEXT, null)).toEqual([]);
    expect(extractEtymologyCandidates(TEXT, undefined)).toEqual([]);
    expect(extractEtymologyCandidates(TEXT, [])).toEqual([]);
  });

  it('keeps an origin with no etymon at all (claim without root)', () => {
    const [r] = extractEtymologyCandidates('ਸੰ. ਪੁਰੁਸ. ਸੰਗ੍ਯਾ- ਮਨੁੱਖ.', [origin({})]);
    expect(r.origin_language).toBe('Sanskrit');
    expect(r.root_form).toBeNull();
  });
});
