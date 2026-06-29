import { describe, it, expect } from 'vitest';
import { buildGrammar, buildInheritedGrammar } from '../pipeline/grammar/build';

// The builder combines two signals into word_grammar rows:
//   - POS from the Mahan Kosh sense marker (pos.ts)
//   - case/number from the surface form's final vowel (viakaran.ts)
// Crucially, the nominal form rules are applied ONLY when the POS is nominal.

const noun = (g = '') => ({ definition_text: `ਸੰਗ੍ਯਾ- ${g}` });
const adj = (g = '') => ({ definition_text: `ਵਿ- ${g}` });
const verb = (g = '') => ({ definition_text: `ਕ੍ਰਿ- ${g}` });
const particle = (g = '') => ({ definition_text: `ਵ੍ਯ- ${g}` });

describe('buildGrammar', () => {
  it('ਨਾਮੁ as a noun → nominative singular row', () => {
    const rows = buildGrammar('ਨਾਮੁ', [noun('ਪ੍ਰਭੂ ਦਾ ਨਾਮ')]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      pos: 'noun',
      gram_case: 'nominative',
      number: 'singular',
      rule_code: 'AUNKAR_NOM_SG',
    });
    expect(rows[0].confidence).toBeGreaterThan(0.6);
  });

  it('ਹੁਕਮਿ as a noun → oblique singular row', () => {
    const rows = buildGrammar('ਹੁਕਮਿ', [noun('ਆਗਿਆ ਅਨੁਸਾਰ')]);
    expect(rows[0]).toMatchObject({
      pos: 'noun',
      gram_case: 'oblique',
      number: 'singular',
      rule_code: 'SIHARI_OBL_SG',
    });
  });

  it('does NOT apply nominal case rules to a verb (ਲਿਖਿ has a sihari but is a verb)', () => {
    const rows = buildGrammar('ਲਿਖਿ', [verb('ਲਿਖਣਾ')]);
    expect(rows).toHaveLength(1);
    expect(rows[0].pos).toBe('verb');
    expect(rows[0].gram_case).toBeNull();
    expect(rows[0].number).toBeNull();
    expect(rows[0].rule_code).toBeNull();
  });

  it('does NOT apply nominal case rules to a particle', () => {
    const rows = buildGrammar('ਭੀ', [particle('ਵੀ, ਅਤੇ')]);
    expect(rows[0].pos).toBe('particle');
    expect(rows[0].gram_case).toBeNull();
  });

  it('emits one row per distinct POS across senses, de-duplicated', () => {
    const rows = buildGrammar('ਸਚੁ', [noun('ਸਤ੍ਯ'), adj('ਸੱਚਾ'), noun('ਪਰਮਾਤਮਾ')]);
    const posList = rows.map((r) => r.pos);
    expect(posList).toContain('noun');
    expect(posList).toContain('adjective');
    expect(new Set(posList).size).toBe(posList.length); // no duplicate POS rows
  });

  it('returns no rows when no sense carries a recognized POS marker', () => {
    const rows = buildGrammar('ਗੁਰ', [{ definition_text: 'ਗੁਰੂ ਦਾ ਸੰਖੇਪ ਰੂਪ' }]);
    expect(rows).toEqual([]);
  });
});

describe('buildInheritedGrammar', () => {
  it('ਨਾਮੁ inherits noun POS and gets its own case/number from the form', () => {
    const row = buildInheritedGrammar('ਨਾਮੁ', 'noun', 'ਨਾਮ');
    expect(row).toMatchObject({
      pos: 'noun',
      gram_case: 'nominative',
      number: 'singular',
      rule_code: 'AUNKAR_NOM_SG',
    });
  });

  it('marks the inherited row with lower confidence and a sourcing note', () => {
    const direct = buildGrammar('ਨਾਮੁ', [{ definition_text: 'ਸੰਗ੍ਯਾ- ਨਾਮ' }])[0];
    const inherited = buildInheritedGrammar('ਨਾਮੁ', 'noun', 'ਨਾਮ');
    expect(inherited.confidence!).toBeLessThan(direct.confidence!);
    expect(inherited.notes).toMatch(/ਨਾਮ/); // names the lemma it was inherited from
  });

  it('does not apply nominal case rules when the inherited POS is non-nominal', () => {
    const row = buildInheritedGrammar('ਕਰਿ', 'verb', 'ਕਰ');
    expect(row.pos).toBe('verb');
    expect(row.gram_case).toBeNull();
  });
});
