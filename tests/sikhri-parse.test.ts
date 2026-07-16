import { describe, it, expect } from 'vitest';
import {
  parseGlossaryCatalog,
  parseEntry,
  decodeWn,
} from '../pipeline/sikhri/parse';

// Fixtures are real gurugranthsahibdictionary.io responses captured 2026-07-16,
// trimmed to the relevant region. The Gurmukhi headword sits in the anchor href
// path exactly as the live Panjabi glossary serves it.
const GLOSSARY_KA = `
<div class="glossary">
  <b>
    <a style="color: #AD8D3F;" href="/dictionary/panjabi/ms/ਕਉ?wn=Mjk4Mw==&searchType=wordmatch&source=Source">
      &#xA15;&#xA09;
    </a>
  </b>
  <b>
    <a style="color: #AD8D3F;" href="/dictionary/panjabi/ms/ਕਉਨੁ?wn=MTU4NjU=&searchType=wordmatch">ਕਉਨੁ</a>
  </b>
  <b>
    <a style="color: #AD8D3F;" href="/dictionary/panjabi/ms/ਕਉਨੁ?wn=NzkxMA==&searchType=wordmatch">ਕਉਨੁ</a>
  </b>
  <b>
    <a style="color: #AD8D3F;" href="/dictionary/panjabi/ms/ਕਉਨੁ?wn=MTI0MjI=&searchType=wordmatch">ਕਉਨੁ</a>
  </b>
</div>`;

// Real English entry detail page for kaliāṇā (wn=MzMwNzE=), headword through etymology.
const ENTRY_KALIANA = `<h5 style="margin: 0;"><b><a href="https://gurugranthsahib.io/bani/details/DIR/1/5?txt=kali&#x101;&#x1E47;&#x101;&amp;x=&amp;y=&amp;lang=en" target="_blank" style="color: #AD8D3F;">kali&#x101;&#x1E47;&#x101;</a></b></h5>
<a style="margin-left: auto;color: #939393;">Published on: July, 2026</a>
</div>
<hr style="width: 25%;" align="left" />
<p>happiness, bliss, joys; blessings.</p>
<p><i class="dictHeading" style="margin-right: 0px!important;">Grammar:</i> <i><span style="color: #212529;">noun, nominative case; masculine, plural. </span></i></p>
<p><i class="dictHeading" style="margin-right: 0px!important;">Etymology:</i> <span style="color: #212529;">Old Panjabi/Lahndi - kaliāṇ (welfare, happiness, success, benediction, good, good fortune); Prakrit - kallāṇ (fortunate; happiness); Pali - kalyāṇ/kallāṇ (beautiful, good); Sanskrit - kalyāṇ (कल्याण - beautiful, lucky). </span></p>
<div class="related-instance"><p>Din Raini</p></div>
<footer><p>In our increasingly interconnected world, the timeless message glows.</p></footer>`;

// A minimal entry with only a meaning, no Grammar/Etymology lines.
const ENTRY_MEANING_ONLY = `<h5><b><a href="#">abc</a></b></h5>
<hr align="left" />
<p>a short gloss only.</p>
<footer><p>footer chrome</p></footer>`;

describe('parseGlossaryCatalog', () => {
  it('reads the Gurmukhi headword (term) from the href path', () => {
    const c = parseGlossaryCatalog(GLOSSARY_KA);
    expect(c[0].term).toBe('ਕਉ');
    expect(c[0].wn).toBe('Mjk4Mw==');
  });

  it('keeps every homograph wn for the same headword', () => {
    const c = parseGlossaryCatalog(GLOSSARY_KA);
    const kaunu = c.filter((e) => e.term === 'ਕਉਨੁ');
    expect(kaunu.map((e) => e.wn)).toEqual(['MTU4NjU=', 'NzkxMA==', 'MTI0MjI=']);
  });

  it('deduplicates identical (term, wn) pairs', () => {
    const c = parseGlossaryCatalog(GLOSSARY_KA + GLOSSARY_KA);
    expect(c.filter((e) => e.term === 'ਕਉ')).toHaveLength(1);
  });

  it('also reads the English edition term (romanization) from its href', () => {
    const en = `<a href="/dictionary/english/ms/ohā?wn=MTM2NTU=&searchType=wordmatch">ohā</a>`;
    const c = parseGlossaryCatalog(en);
    expect(c[0].term).toBe('ohā');
    expect(c[0].wn).toBe('MTM2NTU=');
  });
});

describe('parseEntry', () => {
  it('extracts the meaning (first bare <p> before the labels)', () => {
    const e = parseEntry(ENTRY_KALIANA);
    expect(e.meaning).toBe('happiness, bliss, joys; blessings.');
  });

  it('does not mistake the mission-statement footer <p> for the meaning', () => {
    const e = parseEntry(ENTRY_KALIANA);
    expect(e.meaning).not.toContain('interconnected');
  });

  it('extracts the grammar line, tags stripped, trailing punctuation trimmed', () => {
    const e = parseEntry(ENTRY_KALIANA);
    expect(e.grammar).toBe('noun, nominative case; masculine, plural');
  });

  it('extracts the full etymology chain verbatim, including Devanagari', () => {
    const e = parseEntry(ENTRY_KALIANA);
    expect(e.etymology).toContain('Old Panjabi/Lahndi - kaliāṇ');
    expect(e.etymology).toContain('Sanskrit - kalyāṇ (कल्याण - beautiful, lucky)');
  });

  it('reads the dictionary romanization from the headword link', () => {
    const e = parseEntry(ENTRY_KALIANA);
    expect(e.headwordRoman).toBe('kaliāṇā');
  });

  it('handles a meaning-only entry with no grammar/etymology', () => {
    const e = parseEntry(ENTRY_MEANING_ONLY);
    expect(e.meaning).toBe('a short gloss only.');
    expect(e.grammar).toBeNull();
    expect(e.etymology).toBeNull();
  });
});

describe('decodeWn', () => {
  it('decodes the base64 wn token to its numeric id', () => {
    expect(decodeWn('Mjk4Mw==')).toBe('2983');
    expect(decodeWn('MzMwNzE=')).toBe('33071');
  });
});
