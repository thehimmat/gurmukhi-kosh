import { describe, it, expect } from 'vitest';
import { extractGrammarFacts } from '../pipeline/grammar/padarth';

// Golden cases use VERBATIM pad-arth bodies pulled from line_translations
// (source_code='ss_padarth', Japji angs 1-8). The extractor must mine Sahib
// Singh's explicit grammar statements while declining the ambiguous (genitive,
// cross-clause) constructions that would mis-attach a fact to the wrong word.

const has = (facts: ReturnType<typeof extractGrammarFacts>, headword: string, attribute: string, value: string) =>
  facts.some((f) => f.headword === headword && f.attribute === attribute && f.value === value);

describe('extractGrammarFacts', () => {
  it('reads a quoted feminine statement (ਹਾਥ ਇਸਤ੍ਰੀ-ਲਿੰਗ)', () => {
    const facts = extractGrammarFacts(
      "ਅਸਗਾਹੁ = ਡੂੰਘਾ ਸਮੁੰਦਰ, ਸੰਸਾਰ। ਹਾਥ = ਸ਼ਬਦ 'ਹਾਥ' ਇਸਤ੍ਰੀ-ਲਿੰਗ ਹੈ, ਇਸ ਵਾਸਤੇ ਇਕ-ਵਚਨ ਵਿਚ ਭੀ ਇਸ ਦੇ ਅੰਤ ਵਿਚ (ੁ) ਨਹੀਂ ਹੈ।"
    );
    expect(has(facts, 'ਹਾਥ', 'gender', 'feminine')).toBe(true);
  });

  it('reads quoted masculine statements (ਸਾਹਿਬੁ, ਸਾਚੁ ਪੁਲਿੰਗ) and nominative (ਕਰਤਾ ਕਾਰਕ)', () => {
    const facts = extractGrammarFacts(
      "'ਸਾਹਿਬੁ' ਪੁਲਿੰਗ ਹੈ, ਇਸ ਕਰ ਕੇ 'ਸਾਚਾ' ਭੀ ਪੁਲਿੰਗ ਹੈ। 'ਸਾਚੁ' ਪੁਲਿੰਗ ਹੈ ... ਅਤੇ 'ਕਰਤਾ ਕਾਰਕ' ਹੋਣਾ ਚਾਹੀਦਾ ਹੈ"
    );
    expect(has(facts, 'ਸਾਹਿਬੁ', 'gender', 'masculine')).toBe(true);
    expect(has(facts, 'ਸਾਚਾ', 'gender', 'masculine')).toBe(true);
    expect(has(facts, 'ਸਾਚੁ', 'gender', 'masculine')).toBe(true);
  });

  it('reads two gendered words in one clause (ਵੇਲਾ ਪੁਲਿੰਗ, ਵੇਲ ਇਸਤ੍ਰੀ-ਲਿੰਗ)', () => {
    const facts = extractGrammarFacts("(ਨੋਟ-'ਵੇਲਾ' ਪੁਲਿੰਗ ਹੈ ਤੇ 'ਵੇਲ' ਇਸਤ੍ਰੀ-ਲਿੰਗ ਹੈ) ।");
    expect(has(facts, 'ਵੇਲਾ', 'gender', 'masculine')).toBe(true);
    expect(has(facts, 'ਵੇਲ', 'gender', 'feminine')).toBe(true);
  });

  it('reads feminine through an intervening ਸ਼ਬਦ (ਕੁਦਰਤਿ)', () => {
    const facts = extractGrammarFacts(
      "ਕੁਦਰਤਿ ਕਵਣ = ਕੀਹ ਸਮਰੱਥਾ? ('ਕੁਦਰਤਿ' ਸ਼ਬਦ ਇਸਤ੍ਰੀ ਲਿੰਗ ਹੈ। ਸੋ ਇਹ 'ਕੁਦਰਤਿ' ਦਾ ਵਿਸ਼ਸ਼ੇਣ ਹੈ। )"
    );
    expect(has(facts, 'ਕੁਦਰਤਿ', 'gender', 'feminine')).toBe(true);
  });

  it('declines a genitive plural-of statement (ਸੁਰਤੀ is NOT ਸੁਰਤਿ)', () => {
    // "'ਸੁਰਤਿ' ਦਾ ਬਹੁ-ਵਚਨ ਹੈ" means ਸੁਰਤੀ is the plural OF ਸੁਰਤਿ — must NOT tag ਸੁਰਤਿ plural.
    const facts = extractGrammarFacts(
      "ਸੋ 'ਸੁਰਤੀ' ਇਸਤ੍ਰੀ-ਲਿੰਗ ਹੈ, ਤੇ 'ਸੁਰਤਿ' ਦਾ ਬਹੁ-ਵਚਨ ਹੈ"
    );
    expect(has(facts, 'ਸੁਰਤੀ', 'gender', 'feminine')).toBe(true);
    expect(has(facts, 'ਸੁਰਤਿ', 'number', 'plural')).toBe(false);
  });

  it('declines a genitive adjective-of statement ("ਬੁਝਾਈ ਦਾ ਵਿਸ਼ੇਸ਼ਣ")', () => {
    const facts = extractGrammarFacts(
      "(ਲਫ਼ਜ਼ 'ਇਕ' ਇਸਤ੍ਰੀ-ਲਿੰਗ ਹੈ ਤੇ ਲਫ਼ਜ਼ 'ਬੁਝਾਈ' ਦਾ ਵਿਸ਼ੇਸ਼ਣ ਹੈ। ਲਫ਼ਜ਼ 'ਇਕੁ' ਪੁਲਿੰਗ ਹੈ ਤੇ ਲਫ਼ਜ਼ 'ਦਾਤਾ' ਦਾ ਵਿਸ਼ੇਸ਼ਣ ਹੈ। )"
    );
    expect(has(facts, 'ਇਕ', 'gender', 'feminine')).toBe(true);
    expect(has(facts, 'ਇਕੁ', 'gender', 'masculine')).toBe(true);
    // ਬੁਝਾਈ / ਦਾਤਾ are the nouns the adjectives modify, not adjectives themselves.
    expect(facts.some((f) => f.headword === 'ਬੁਝਾਈ')).toBe(false);
    expect(facts.some((f) => f.headword === 'ਦਾਤਾ')).toBe(false);
  });

  it('reads parenthetical noun number tags (ਕੋਟੁ sg, ਕੋਟ pl, ਕੋਟਿ adj)', () => {
    const facts = extractGrammarFacts(
      "ਕੋਟਿ = ਕ੍ਰੋੜ (ਵਿਸ਼ੇਸ਼ਣ) । ਲੰਕਾ ਸਾ ਕੋਟੁ ਸਮੁੰਦ। ਕੋਟੁ = ਕਿਲ੍ਹਾ (ਨਾਂਵ ਇਕ-ਵਚਨ) । ਕੋਟ = ਕਿਲ੍ਹੇ (ਨਾਂਵ, ਬਹੁ ਵਚਨ) ।"
    );
    expect(has(facts, 'ਕੋਟਿ', 'pos', 'adjective')).toBe(true);
    expect(has(facts, 'ਕੋਟੁ', 'pos', 'noun')).toBe(true);
    expect(has(facts, 'ਕੋਟੁ', 'number', 'singular')).toBe(true);
    expect(has(facts, 'ਕੋਟ', 'pos', 'noun')).toBe(true);
    expect(has(facts, 'ਕੋਟ', 'number', 'plural')).toBe(true);
  });

  it('reads parenthetical number tags on pronoun lemmas (ਤਿਨਿ sg, ਤਿਨ pl)', () => {
    const facts = extractGrammarFacts(
      "(1)  ਤਿਨਿ = ਉਸ ਮਨੁੱਖ ਨੇ (ਇਕ-ਵਚਨ) 'ਜਿਨਿ ਸੇਵਿਆ ਤਿਨਿ ਪਾਇਆ ਮਾਨੁ'। (2)  ਤਿਨ = ਉਹਨਾਂ ਮਨੁੱਖਾਂ ਨੇ (ਬਹੁ-ਵਚਨ) ।"
    );
    expect(has(facts, 'ਤਿਨਿ', 'number', 'singular')).toBe(true);
    expect(has(facts, 'ਤਿਨ', 'number', 'plural')).toBe(true);
  });

  it('reads singular vs plural verb forms (ਗਾਵੈ sg, ਗਾਵਨਿ pl)', () => {
    const facts = extractGrammarFacts("ਗਾਵੈ = ਗਾਂਦਾ ਹੈ {'ਗਾਵੈ' ਇਕ-ਵਚਨ ਹੈ, 'ਗਾਵਨਿ' ਬਹੁ-ਵਚਨ ਹੈ}।");
    expect(has(facts, 'ਗਾਵੈ', 'number', 'singular')).toBe(true);
    expect(has(facts, 'ਗਾਵਨਿ', 'number', 'plural')).toBe(true);
  });

  it('does not treat a quoted meta-term as a head-word', () => {
    const facts = extractGrammarFacts(
      "ਵਿਆਕਰਨ ਦਾ ਨੀਯਮ ਹੈ ਕਿ ਕਿਸੇ 'ਨਾਂਵ' ਦੇ ਵਿਸ਼ੇਸ਼ਣ ਦਾ ਉਹੀ ਲਿੰਗ ਹੁੰਦਾ ਹੈ"
    );
    expect(facts.some((f) => f.headword === 'ਨਾਂਵ')).toBe(false);
  });

  it('returns nothing for a plain gloss with no grammar note', () => {
    expect(extractGrammarFacts('ਹੈ– ਭਾਵ, ਇਸ ਵੇਲੇ ਭੀ ਹੈ। ਨਾਨਕ = ਹੇ ਨਾਨਕ! ਹੋਸੀ = ਹੋਵੇਗਾ, ਰਹੇਗਾ। 1।')).toEqual([]);
  });

  it('returns nothing for empty input', () => {
    expect(extractGrammarFacts('')).toEqual([]);
  });
});
