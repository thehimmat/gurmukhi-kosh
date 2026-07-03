import { describe, it, expect } from 'vitest';
import { stem } from '../pipeline/grammar/viakaran';
import { groupLexemes } from '../pipeline/grammar/lexeme';

// Inflected forms of one lexeme share a consonant stem and differ only in their
// final vowel (kaarak ending). Stripping that final vowel yields a stem key we
// can group by: ਹੁਕਮੁ / ਹੁਕਮਿ / ਹੁਕਮ all reduce to ਹੁਕਮ.

describe('stem', () => {
  it('strips a final aunkar (ਹੁਕਮੁ → ਹੁਕਮ)', () => {
    expect(stem('ਹੁਕਮੁ')).toBe('ਹੁਕਮ');
  });
  it('strips a final sihari (ਹੁਕਮਿ → ਹੁਕਮ)', () => {
    expect(stem('ਹੁਕਮਿ')).toBe('ਹੁਕਮ');
  });
  it('leaves a mukta form unchanged (ਹੁਕਮ → ਹੁਕਮ)', () => {
    expect(stem('ਹੁਕਮ')).toBe('ਹੁਕਮ');
  });
  it('preserves internal vowels, only strips the final one (ਨਾਮਿ → ਨਾਮ)', () => {
    expect(stem('ਨਾਮਿ')).toBe('ਨਾਮ');
  });
});

describe('groupLexemes', () => {
  it('groups forms that share a stem into one lexeme', () => {
    const groups = groupLexemes(['ਹੁਕਮੁ', 'ਹੁਕਮਿ', 'ਹੁਕਮ']);
    expect(groups).toHaveLength(1);
    expect(groups[0].stem).toBe('ਹੁਕਮ');
    expect(groups[0].forms.map((f) => f.gurmukhi).sort()).toEqual(
      ['ਹੁਕਮ', 'ਹੁਕਮਿ', 'ਹੁਕਮੁ'].sort(),
    );
  });

  it('keeps forms with different stems in separate groups', () => {
    const groups = groupLexemes(['ਨਾਮੁ', 'ਨਾਮਿ', 'ਹੁਕਮੁ', 'ਹੁਕਮਿ']);
    expect(groups).toHaveLength(2);
    const stems = groups.map((g) => g.stem).sort();
    expect(stems).toEqual(['ਨਾਮ', 'ਹੁਕਮ'].sort());
  });

  it('drops singletons (a lexeme needs at least two related forms)', () => {
    const groups = groupLexemes(['ਨਾਮੁ', 'ਹੁਕਮੁ', 'ਹੁਕਮਿ']);
    expect(groups).toHaveLength(1);
    expect(groups[0].stem).toBe('ਹੁਕਮ');
  });

  it('labels each form with an inflection description from the Viakaran analysis', () => {
    const groups = groupLexemes(['ਹੁਕਮੁ', 'ਹੁਕਮਿ']);
    const byForm = Object.fromEntries(groups[0].forms.map((f) => [f.gurmukhi, f.inflection_desc]));
    expect(byForm['ਹੁਕਮੁ']).toMatch(/nominative/);
    expect(byForm['ਹੁਕਮਿ']).toMatch(/oblique/);
  });

  it('de-duplicates repeated surface forms', () => {
    const groups = groupLexemes(['ਹੁਕਮੁ', 'ਹੁਕਮੁ', 'ਹੁਕਮਿ']);
    expect(groups[0].forms).toHaveLength(2);
  });
});
