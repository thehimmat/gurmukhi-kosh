import { describe, it, expect } from 'vitest';
import { parsePosFromDefinition } from '../pipeline/grammar/pos';

// Mahan Kosh prefixes each sense with an abbreviated part-of-speech marker
// ("MARKER- gloss…"). These golden cases use the real leading markers and
// example words observed in pipeline/mahan-kosh/output/entries.jsonl.

describe('parsePosFromDefinition', () => {
  it('ਸੰਗ੍ਯਾ → noun (e.g. ਸਤਿ)', () => {
    const r = parsePosFromDefinition('ਸੰਗ੍ਯਾ- ਗੁਰਬਾਣੀ ਵਿੱਚ…');
    expect(r?.pos).toBe('noun');
    expect(r?.marker).toBe('ਸੰਗ੍ਯਾ');
  });

  it('ਸੰਗਯਾ (un-subjoined variant) → noun (e.g. ਵੀਰ)', () => {
    const r = parsePosFromDefinition('ਸੰਗਯਾ- ਭਰਾ…');
    expect(r?.pos).toBe('noun');
  });

  it('ਵਿ → adjective (e.g. ਨਿਰਵੈਰੁ)', () => {
    const r = parsePosFromDefinition('ਵਿ- ਜਿਸ ਦਾ ਕੋਈ ਵੈਰੀ ਨਹੀਂ…');
    expect(r?.pos).toBe('adjective');
  });

  it('ਸਰਵ → pronoun (e.g. ਕੋ)', () => {
    const r = parsePosFromDefinition('ਸਰਵ- ਕੋਈ…');
    expect(r?.pos).toBe('pronoun');
  });

  it('ਵ੍ਯ → particle (e.g. ਭੀ)', () => {
    const r = parsePosFromDefinition('ਵ੍ਯ- ਭੀ, ਅਤੇ…');
    expect(r?.pos).toBe('particle');
  });

  it('ਕ੍ਰਿ → verb (e.g. ਲਿਖਿ)', () => {
    const r = parsePosFromDefinition('ਕ੍ਰਿ- ਲਿਖਣਾ…');
    expect(r?.pos).toBe('verb');
  });

  it('ਭਾਵ is a gloss intro, not a POS → null', () => {
    expect(parsePosFromDefinition('ਭਾਵ- ਆਕਾਸ ਤੋਂ ਮੁਰਾਦ…')).toBeNull();
  });

  it('returns null when there is no leading marker', () => {
    expect(parsePosFromDefinition('ਗੁਰਬਾਣੀ ਵਿੱਚ ਆਏ ਸ਼ਬਦ ਦਾ ਅਰਥ…')).toBeNull();
  });

  it('tolerates a leading sense number before the marker', () => {
    // Later senses can read "੨. ਸੰਗ੍ਯਾ- …"; the parser should still find noun.
    const r = parsePosFromDefinition('੨. ਸੰਗ੍ਯਾ- ਦੂਜਾ ਅਰਥ…');
    expect(r?.pos).toBe('noun');
  });
});
