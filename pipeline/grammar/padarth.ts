// Extract explicit grammar facts from Sahib Singh's Darpan pad-arth prose.
//
// Sahib Singh's pad-arth (BaniDB key `pss`, stored in line_translations under
// source_code='ss_padarth') is word-by-word glosses that occasionally state a
// word's grammar outright, e.g.
//   ਸ਼ਬਦ 'ਹਾਥ' ਇਸਤ੍ਰੀ-ਲਿੰਗ ਹੈ     → ਹਾਥ is feminine
//   'ਵੀਚਾਰੁ' ਪੁਲਿੰਗ ਹੈ            → ਵੀਚਾਰੁ is masculine
//   ਕੋਟੁ = ਕਿਲ੍ਹਾ (ਨਾਂਵ ਇਕ-ਵਚਨ)   → ਕੋਟੁ is a singular noun
//
// These are *sourced*, scholar-stated facts (unlike the rule engine's inferred
// case/number), so the ingest layer writes them with a citation to the exact
// pad-arth line. This module is the pure extractor: body text → candidate facts.
//
// Provenance-first design: we only emit a fact when an explicit grammatical
// predicate is bound to a clearly named head-word, and we DECLINE in the
// ambiguous constructions that would mis-attach a fact:
//   - genitive predicates ("'ਸੁਰਤਿ' ਦਾ ਬਹੁ-ਵਚਨ", "'ਬੁਝਾਈ' ਦਾ ਵਿਸ਼ੇਸ਼ਣ") describe a
//     DIFFERENT word, so a ਦਾ/ਦੇ/ਦੀ between the word and the predicate aborts the bind;
//   - quoted grammatical meta-terms ('ਨਾਂਵ', 'ਵਿਸ਼ੇਸ਼ਣ', …) are never head-words;
//   - a predicate too far from any named word (different clause) is left unbound.
// Each fact carries the verbatim snippet so a reviewer can audit the binding.

export type GramAttr = 'gender' | 'number' | 'pos' | 'gram_case';

export interface PadarthFact {
  headword: string;
  attribute: GramAttr;
  value: string; // masculine|feminine | singular|plural | noun|adjective|pronoun | nominative
  snippet: string; // verbatim window around the statement, for citation/audit
}

const GURMUKHI = '\\u0A00-\\u0A7F';
const TOKEN = `[${GURMUKHI}]+`;
// Straight and curly single quotes both occur in the source text.
const QUOTE = `['\\u2018\\u2019]`;

// Quoted tokens that are themselves grammatical meta-terms, never head-words.
const META_TERMS = new Set([
  'ਨਾਂਵ', 'ਪੜਨਾਂਵ', 'ਵਿਸ਼ੇਸ਼ਣ', 'ਕਿਰਿਆ',
  'ਲਿੰਗ', 'ਵਚਨ', 'ਕਾਰਕ', 'ਪੁਲਿੰਗ',
  'ਸ਼ਬਦ', 'ਲਫ਼ਜ਼',
]);

// Predicate patterns. Each maps a piece of the prose to a (attribute, value).
// Hyphen/space between compound parts varies (ਇਸਤ੍ਰੀ-ਲਿੰਗ / ਇਸਤ੍ਰੀ ਲਿੰਗ / ਇਸਤ੍ਰੀਲਿੰਗ).
const PREDICATES: Array<{ re: RegExp; attribute: GramAttr; value: string }> = [
  { re: new RegExp('ਇਸਤ੍ਰੀ[\\s-]*ਲਿੰਗ'), attribute: 'gender', value: 'feminine' },
  { re: new RegExp('ਪੁਲਿੰਗ'), attribute: 'gender', value: 'masculine' },
  { re: new RegExp('ਇਕ[\\s-]*ਵਚਨ'), attribute: 'number', value: 'singular' },
  { re: new RegExp('ਬਹੁ[\\s-]*ਵਚਨ'), attribute: 'number', value: 'plural' },
  { re: new RegExp('ਕਰਤਾ[\\s]*ਕਾਰਕ'), attribute: 'gram_case', value: 'nominative' },
];

// Parenthetical POS tags. Order matters: ਪੜਨਾਂਵ contains ਨਾਂਵ, so test it first.
const POS_TAGS: Array<{ re: RegExp; value: string }> = [
  { re: new RegExp('ਪੜਨਾਂਵ'), value: 'pronoun' },
  { re: new RegExp('ਵਿਸ਼ੇਸ਼ਣ'), value: 'adjective' },
  { re: new RegExp('ਨਾਂਵ'), value: 'noun' },
];

const MAX_GAP = 28; // chars allowed between a head-word and its predicate
const GENITIVE = new RegExp(`(?:^|[^${GURMUKHI}])(?:ਦਾ|ਦੇ|ਦੀ)(?:[^${GURMUKHI}]|$)`);

interface QuotedTok {
  text: string;
  start: number; // index of opening quote
  end: number; // index just after closing quote
}

function quotedTokens(body: string): QuotedTok[] {
  const re = new RegExp(`${QUOTE}(${TOKEN})${QUOTE}`, 'g');
  const out: QuotedTok[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    out.push({ text: m[1], start: m.index, end: m.index + m[0].length });
  }
  return out;
}

function snippetAround(body: string, from: number, to: number): string {
  const s = Math.max(0, from - 8);
  const e = Math.min(body.length, to + 8);
  return body.slice(s, e).trim();
}

/**
 * Mode A — a quoted head-word directly ascribed a property:
 *   'ਵੀਚਾਰੁ' ਪੁਲਿੰਗ ਹੈ  ·  ਸ਼ਬਦ 'ਹਾਥ' ਇਸਤ੍ਰੀ-ਲਿੰਗ ਹੈ
 * For each predicate occurrence, bind to the nearest quoted token that closes
 * before it, within MAX_GAP and with no danda or genitive marker in between.
 */
function modeA(body: string, toks: QuotedTok[], seen: Set<string>): PadarthFact[] {
  const facts: PadarthFact[] = [];
  for (const p of PREDICATES) {
    const re = new RegExp(p.re.source, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(body))) {
      const pStart = m.index;
      // nearest quoted token closing before this predicate
      let best: QuotedTok | null = null;
      for (const t of toks) {
        if (t.end > pStart) break;
        best = t;
      }
      if (!best) continue;
      if (META_TERMS.has(best.text)) continue;
      const gap = pStart - best.end;
      if (gap < 0 || gap > MAX_GAP) continue;
      const between = body.slice(best.end, pStart);
      if (between.includes('।')) continue; // crossed a sentence boundary
      if (GENITIVE.test(between)) continue; // predicate describes a different word
      const key = `${best.text}|${p.attribute}|${p.value}`;
      if (seen.has(key)) continue;
      seen.add(key);
      facts.push({
        headword: best.text,
        attribute: p.attribute,
        value: p.value,
        snippet: snippetAround(body, best.start, pStart + m[0].length),
      });
    }
  }
  return facts;
}

/**
 * Mode B — a parenthetical tag on a lemma gloss:
 *   ਕੋਟੁ = ਕਿਲ੍ਹਾ (ਨਾਂਵ ਇਕ-ਵਚਨ)  ·  ਕੋਟਿ = ਕ੍ਰੋੜ (ਵਿਸ਼ੇਸ਼ਣ)
 * Only parens with NO quoted token inside (those are Mode A's) bind to the
 * nearest preceding "WORD =" lemma, not crossing a danda.
 */
function modeB(body: string, seen: Set<string>): PadarthFact[] {
  const facts: PadarthFact[] = [];
  const lemmaRe = new RegExp(`(${TOKEN})\\s*=`, 'g');
  const parenRe = /\(([^)]*)\)/g;
  let pm: RegExpExecArray | null;
  while ((pm = parenRe.exec(body))) {
    const inner = pm[1];
    if (new RegExp(QUOTE).test(inner)) continue; // Mode A territory
    const tags: Array<{ attribute: GramAttr; value: string }> = [];
    if (new RegExp('ਇਕ[\\s-]*ਵਚਨ').test(inner)) tags.push({ attribute: 'number', value: 'singular' });
    if (new RegExp('ਬਹੁ[\\s-]*ਵਚਨ').test(inner)) tags.push({ attribute: 'number', value: 'plural' });
    for (const pt of POS_TAGS) {
      if (pt.re.test(inner)) { tags.push({ attribute: 'pos', value: pt.value }); break; }
    }
    if (!tags.length) continue;

    // nearest "WORD =" closing before this paren, no danda in between
    lemmaRe.lastIndex = 0;
    let lemma: { text: string; end: number } | null = null;
    let lm: RegExpExecArray | null;
    while ((lm = lemmaRe.exec(body))) {
      if (lm.index + lm[0].length > pm.index) break;
      lemma = { text: lm[1], end: lm.index + lm[0].length };
    }
    if (!lemma) continue;
    if (META_TERMS.has(lemma.text)) continue;
    if (body.slice(lemma.end, pm.index).includes('।')) continue;

    for (const t of tags) {
      const key = `${lemma.text}|${t.attribute}|${t.value}`;
      if (seen.has(key)) continue;
      seen.add(key);
      facts.push({
        headword: lemma.text,
        attribute: t.attribute,
        value: t.value,
        snippet: snippetAround(body, lemma.end - lemma.text.length, pm.index + pm[0].length),
      });
    }
  }
  return facts;
}

/**
 * Extracts the explicit grammar facts Sahib Singh states in one pad-arth body.
 * Deduplicated per (headword, attribute, value); only high-precision bindings
 * are returned (see module header for the constructions we decline on).
 */
export function extractGrammarFacts(body: string): PadarthFact[] {
  if (!body || !body.trim()) return [];
  const toks = quotedTokens(body);
  const seen = new Set<string>();
  return [...modeA(body, toks, seen), ...modeB(body, seen)];
}
