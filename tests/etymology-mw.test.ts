import { describe, it, expect } from 'vitest';
import { extractGlossFromTei } from '../pipeline/etymology/monier-williams';

// Fixture is the real TEI-XML for the "guru" entry from the C-SALT Monier-Williams
// REST API (GET .../entries?field=headword_slp1&query=guru&query_type=term),
// captured 2026-07-01, truncated to the first <sense> plus enough of the
// second to confirm we stop at the first </sense>.
const GURU_XML = `<entry xmlns="http://www.tei-c.org/ns/1.0" xml:id="lemma-guru" ana="H1"><form><idno ana="hc3">110</idno><orth ana="key1" xml:lang="san-Latn-x-SLP1">guru</orth><idno ana="hc1">1</idno><hyph ana="key2" xml:lang="san-Latn-x-SLP1-headword">gur/u</hyph></form><sense><gramGrp><gram ana="lex">mf<pc ana="p" unit="round-bracket-left">(</pc><m xml:lang="san-Latn-x-SLP1" type="suffix">vI</m><pc ana="p" unit="round-bracket-right">)</pc>n.</gram></gramGrp><pc ana="p" unit="round-bracket-left">(</pc><abbr type="cf"><ref target="#abbr-cf_">cf.</ref></abbr><w xml:lang="san-Latn-x-SLP1">gir/i</w> ;  <abbr><ref target="#abbr-comp_">comp.</ref></abbr> <w xml:lang="san-Latn-x-SLP1">g/arIyas</w>, once <w xml:lang="san-Latn-x-SLP1">yas-tara</w>, <w xml:lang="san-Latn-x-SLP1">guru-tara</w>, superl. <w xml:lang="san-Latn-x-SLP1">garizWa</w>, <w xml:lang="san-Latn-x-SLP1">gurutama</w> <span ana="see">, see</span> <abbr><ref target="#abbr-ss_vv_">ss.vv.</ref></abbr><pc ana="p" unit="round-bracket-right">)</pc> heavy, weighty <pc ana="p" unit="round-bracket-left">(</pc>opposed to <w xml:lang="san-Latn-x-SLP1">laG/u</w><pc ana="p" unit="round-bracket-right">)</pc> <cit type="literary_source"><bibl xml:lang="san-Latn-x-CSDL"><ref target="#auth-RV_">RV.</ref> i, 39, 3 and iv, 5, 6</bibl></cit>; <cit type="literary_source"><bibl xml:lang="san-Latn-x-CSDL"><ref target="#auth-AV_">AV.</ref></bibl></cit> <abbr ana="etc">&amp;c</abbr> <pc ana="p" unit="round-bracket-left">(</pc><abbr><ref target="#abbr-g_">g.</ref></abbr> <w xml:lang="san-Latn-x-SLP1">SORqAdi</w> <cit type="literary_source"><bibl xml:lang="san-Latn-x-CSDL"><ref target="#auth-Gan2ar_">Gan2ar.</ref> 101</bibl></cit><pc ana="p" unit="round-bracket-right">)</pc><note><ref target="#page-0359" type="facs">359,2</ref><idno ana="L" xml:id="monier_65987">65987</idno></note></sense><sense ana="H1A"><gramGrp><gram ana="lex" value="inh">mf THIS SHOULD NOT APPEAR</gram></gramGrp></sense></entry>`;

describe('extractGlossFromTei', () => {
  it('extracts readable text from the first <sense> only, tags stripped', () => {
    const gloss = extractGlossFromTei(GURU_XML);
    expect(gloss).toContain('heavy, weighty');
    expect(gloss).toContain('opposed to');
    expect(gloss).toContain('RV. i, 39, 3 and iv, 5, 6');
  });

  it('stops at the first </sense> — does not bleed into a second sense', () => {
    const gloss = extractGlossFromTei(GURU_XML);
    expect(gloss).not.toContain('THIS SHOULD NOT APPEAR');
  });

  it('strips <note> page-reference/id metadata, not just tags', () => {
    const gloss = extractGlossFromTei(GURU_XML);
    expect(gloss).not.toContain('359,2');
    expect(gloss).not.toContain('65987');
  });

  it('decodes the &amp; entity', () => {
    const gloss = extractGlossFromTei(GURU_XML);
    expect(gloss).toContain('&c');
    expect(gloss).not.toContain('&amp;');
  });

  it('returns null when there is no <sense> element', () => {
    expect(extractGlossFromTei('<entry><form><orth>x</orth></form></entry>')).toBeNull();
  });
});
