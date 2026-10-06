import { describe, it, expect } from 'vitest';
import { mahanKoshGrammarRows } from '../pipeline/grammar/build';

// The grammar pipeline writes only what Mahan Kosh states: the part of speech
// read from each sense's own marker. It never infers case, number, gender or
// verb form from a word's spelling (the retired Viakaran ending rules, #21 /
// #27 / #117), so the surface form is not even an input.

const noun = (g = '') => ({ definition_text: `ਸੰਗ੍ਯਾ- ${g}` });
const adj = (g = '') => ({ definition_text: `ਵਿ- ${g}` });
const pronoun = (g = '') => ({ definition_text: `ਸਰਵ- ${g}` });
const verb = (g = '') => ({ definition_text: `ਕ੍ਰਿ- ${g}` });

const MAHAN_KOSH_POS = { provenance: 'scraped', source_code: 'mahan_kosh' };

describe('mahanKoshGrammarRows', () => {
  it('writes the POS the sense marker states, attributed to Mahan Kosh', () => {
    expect(mahanKoshGrammarRows([noun('ਪ੍ਰਭੂ ਦਾ ਨਾਮ')])).toEqual([{ pos: 'noun', ...MAHAN_KOSH_POS }]);
  });

  it('asserts nothing beyond POS: no case, number, gender, verb form or rule', () => {
    const [row] = mahanKoshGrammarRows([noun()]);
    expect(Object.keys(row).sort()).toEqual(['pos', 'provenance', 'source_code']);
  });

  it('gives a pronoun only its POS (#117: no noun case/gender carried onto ਤਿਸੁ)', () => {
    expect(mahanKoshGrammarRows([pronoun('ਉਸ')])).toEqual([{ pos: 'pronoun', ...MAHAN_KOSH_POS }]);
  });

  it('gives a verb only its POS (no verb form read off the ending, #54)', () => {
    expect(mahanKoshGrammarRows([verb('ਕਰਨਾ')])).toEqual([{ pos: 'verb', ...MAHAN_KOSH_POS }]);
  });

  it('emits one row per distinct POS across senses, in sense order', () => {
    const rows = mahanKoshGrammarRows([noun('ਸਤ੍ਯ'), adj('ਸੱਚਾ'), noun('ਪਰਮਾਤਮਾ')]);
    expect(rows.map((r) => r.pos)).toEqual(['noun', 'adjective']);
  });

  it('returns no rows when no sense carries a recognized POS marker', () => {
    expect(mahanKoshGrammarRows([{ definition_text: 'ਗੁਰੂ ਦਾ ਸੰਖੇਪ ਰੂਪ' }])).toEqual([]);
  });

  it('returns no rows for a pure redirect (no POS is borrowed from the target)', () => {
    expect(mahanKoshGrammarRows([{ definition_text: 'ਦੇਖੋ, ਨਾਮ.' }])).toEqual([]);
  });
});
