import { describe, it, expect } from 'vitest';
import {
  extractDsalResult,
  extractDsalResults,
  selectDsalResult,
  foldForMatch,
  headwordVariants,
  stripArabicDiacritics,
} from '../pipeline/etymology/dsal';

// Fixtures are real DSAL CGI responses captured 2026-07-01
// (GET dsal.uchicago.edu/cgi-bin/app/{dict}_query.py?qs=…&searchhws=yes&matchtype=exact),
// trimmed to the result region; long compound-phrase listings are truncated with
// a marker comment where noted.

// Platts, qs=قدرت — one exact match. Includes the transliteration_tip span that
// must not leak into the parsed output.
const PLATTS_QUDRAT = `<div id='page'>

		<div id='query_display'>
			Search for headword: <b>قدرت</b>
                       <div id='no_results'>
                                1 result
                        <span id='transliteration_tip'>
                        Highlight Devanagari and press "t" to transliterate.
			<br/>
			(Perso-Arabic transliteration not supported at this time)
                        </span>
                        </div>
		</div>



	<div id='results_display'>

	<br/>


			<div class='hw_result'>&nbsp;&nbsp;
			1) <a href="/cgi-bin/app/platts_query.py?qs=قدرت&searchhws=yes&matchtype=exact">قدرت</a>  qudrat
			(<a href="/cgi-bin/app/platts_query.py?page=788">p. 788</a>)
			<blockquote><entry> <p>P <hw><pa>قدرت</pa> <i>qudrat</i></hw> (for A. <pa>قدرة</pa>, inf. n. of <pa>قدر</pa> 'to be able,' &c.), s.f. Power, ability, potency, vigour, force, authority, virtue; divine power, omnipotence; — the creation, the universe, nature: — <i>qudrat rakhnā</i> (-<i>kī</i>), To have power (to), to be able.</p></blockquote>
			</div>
        </div>
</div>`;

// Steingass, qs=حكم (Arabic kāf) — one exact match. The [ … ] block of compound
// phrases is truncated here (real entry has ~20 more) but keeps its real shape.
const STEINGASS_HUKM = `<div id='page'>

		<div id='query_display'>
			Search for headword: <b>حكم</b>
                       <div id='no_results'>
                                1 result
                        </div>
		</div>



	<div id='results_display'>
			<div class='hw_result'>&nbsp;&nbsp;
			1) <a href="/cgi-bin/app/steingass_query.py?qs=حكم&searchhws=yes&matchtype=exact">حكم</a> ḥukm
			(<a href="/cgi-bin/app/steingass_query.py?page=427">p. 427</a>)
			<blockquote><lang>A</lang> <hw><pa>حكم</pa> <i>ḥukm</i></hw> (v.n.), Exercising authority, commanding; command, dominion, government; judgment, sentence, decree; wisdom, knowledge; proportion, relation; (adverbially) like; [<i>ḥukmi biyāẓī</i>, A royal mandate issued with secrecy and despatch; — <i>ḥukm dādan</i>, To govern (m.c.); — <i>ba-ḥukmi ẓarūrat</i>, Through necessity;] — <i>ḥakam</i>, An umpire, arbitrator, mediator; — <i>ḥikam</i> (pl. of <i>ḥikmat</i>), Wise sayings; sciences. </blockquote>
			</div>
        </div>
</div>`;

// Platts, qs=حکم — three exact-match homographs (ḥukm, ḥakam, ḥikam); only the
// first result's entry matters, the others are trimmed to their result lines.
const PLATTS_HUKM_MULTI = `	<div id='results_display'>

	<br/>


			<div class='hw_result'>&nbsp;&nbsp;
			1) <a href="/cgi-bin/app/platts_query.py?qs=حکم&searchhws=yes&matchtype=exact">حکم</a>  ḥukm
			(<a href="/cgi-bin/app/platts_query.py?page=480">p. 480</a>)
			<blockquote><entry> <p>A <hw><pa>حکم</pa> <i>ḥukm</i></hw> (inf. n. of <pa>حکم</pa> 'to prevent or restrain'), s.m. Judgment, judicial decision, sentence, decree, verdict, doom, award; judicial authority, jurisdiction, rule, dominion, government, control, direction, management; — an ordinance, a statute, a prescript, edict, decree, law, enactment, precept, rule, predicament; an order, a command; sanction, permission, a requisition; — effect, influence, efficiency; article (of faith, &c.); — the firs card thrown by rule (in a game): — <i>ḥukm uṭhānā</i> (-<i>ka</i>), To execute or carry out an order; — to countermand or cancel an order.</p></blockquote>
			</div>


			<div class='hw_result'>&nbsp;&nbsp;
			2) <a href="/cgi-bin/app/platts_query.py?qs=حکم&searchhws=yes&matchtype=exact">حکم</a>  ḥakam
			(<a href="/cgi-bin/app/platts_query.py?page=480">p. 480</a>)
			<blockquote><entry> <p>A <hw><pa>حکم</pa> <i>ḥakam</i></hw> (v.n. fr. <pa>حکم</pa>), s.m. An umpire, arbitrator, mediator.</p></blockquote>
			</div>
        </div>`;

// Steingass, qs=حکم (Farsi kāf) — the same word misses under the other kāf
// codepoint; this is the real no-result shape.
const STEINGASS_NO_RESULT = `<div id='page'>

		<div id='query_display'>
			No results for search term <b>حکم</b>
		</div>



	<div id='results_display'>

		<div class='container'>
	<br/>
		</div>
        </div>
</div>`;

const PLATTS_NO_RESULT = `<div id='page'>

		<div id='query_display'>
			No results for search term <b>خخخخ</b>
		</div>



	<div id='results_display'>

	<br/>
        </div>
</div>`;

describe('extractDsalResult — Platts', () => {
  it('parses headword, roman transliteration, and gloss from a single result', () => {
    const r = extractDsalResult(PLATTS_QUDRAT, 'platts');
    expect(r).not.toBeNull();
    expect(r!.headword).toBe('قدرت');
    expect(r!.roman).toBe('qudrat');
    expect(r!.gloss).toContain('Power, ability, potency');
    expect(r!.gloss).toContain('the creation, the universe, nature');
  });

  it('cuts the gloss at the compound-phrases section (": —")', () => {
    const r = extractDsalResult(PLATTS_QUDRAT, 'platts');
    expect(r!.gloss).not.toContain('qudrat rakhnā');
    expect(r!.gloss).not.toContain('To have power');
  });

  it('keeps "; —" sense separators inside the main gloss (only ": —" cuts)', () => {
    const r = extractDsalResult(PLATTS_HUKM_MULTI, 'platts');
    expect(r!.gloss).toContain('an ordinance, a statute');
    expect(r!.gloss).not.toContain('ḥukm uṭhānā');
  });

  it('does not leak page-scaffolding text into the gloss', () => {
    const r = extractDsalResult(PLATTS_QUDRAT, 'platts');
    expect(r!.gloss).not.toContain('Highlight Devanagari');
    expect(r!.gloss).not.toContain('p. 788');
  });

  it('defaults to the first result when exact match returns homographs', () => {
    const r = extractDsalResult(PLATTS_HUKM_MULTI, 'platts');
    expect(r!.roman).toBe('ḥukm');
    expect(r!.gloss).toContain('Judgment, judicial decision');
    expect(r!.gloss).not.toContain('umpire');
  });

  it('extractDsalResults returns every homograph with its own gloss', () => {
    const all = extractDsalResults(PLATTS_HUKM_MULTI, 'platts');
    expect(all).toHaveLength(2);
    expect(all[0].roman).toBe('ḥukm');
    expect(all[1].roman).toBe('ḥakam');
    expect(all[1].gloss).toContain('umpire');
  });

  it('returns null on the no-result page', () => {
    expect(extractDsalResult(PLATTS_NO_RESULT, 'platts')).toBeNull();
  });
});

describe('extractDsalResult — Steingass', () => {
  it('parses headword, roman transliteration, and gloss', () => {
    const r = extractDsalResult(STEINGASS_HUKM, 'steingass');
    expect(r).not.toBeNull();
    expect(r!.headword).toBe('حكم');
    expect(r!.roman).toBe('ḥukm');
    expect(r!.gloss).toContain('Exercising authority, commanding');
    expect(r!.gloss).toContain('(adverbially) like');
  });

  it('strips the bracketed compound-phrase block and trailing sub-lemmas', () => {
    const r = extractDsalResult(STEINGASS_HUKM, 'steingass');
    expect(r!.gloss).not.toContain('ḥukmi biyāẓī');
    expect(r!.gloss).not.toContain('Through necessity');
    // "— ḥakam, An umpire…" after the bracket block is a different vocalization,
    // not part of the ḥukm gloss
    expect(r!.gloss).not.toContain('umpire');
  });

  it('returns null on the no-result page', () => {
    expect(extractDsalResult(STEINGASS_NO_RESULT, 'steingass')).toBeNull();
  });
});

// Homograph selection: the same Perso-Arabic spelling covers several
// vocalizations (Platts حکم → ḥukm / ḥakam / ḥikam); the Gurmukhi word's own
// vowels say which one Mahan Kosh meant. Targets below are real
// gurmukhiToDisplayIPA() outputs; roman forms are real DSAL homograph sets
// that picked the wrong entry when we naively took the first result.
describe('selectDsalResult', () => {
  const mk = (roman: string) => ({ headword: 'x', roman, gloss: `gloss of ${roman}` });

  it('ਸੇਖ (seːkʰ) picks shaiḵẖ (elder), not shīḵẖ (the sea-shore)', () => {
    const r = selectDsalResult([mk('shīḵẖ'), mk('shaiḵẖ')], 'seːkʰ');
    expect(r!.roman).toBe('shaiḵẖ');
  });

  it('ਕਰਮ (kəɾəm) picks karam (bounty), not karm (a water-side plant)', () => {
    const r = selectDsalResult([mk('karm'), mk('karam')], 'kəɾəm');
    expect(r!.roman).toBe('karam');
  });

  it('ਸੂਰ (suːɾ) picks ṣūr (trumpet), not ṣaur', () => {
    const r = selectDsalResult([mk('ṣaur'), mk('ṣūr')], 'suːɾ');
    expect(r!.roman).toBe('ṣūr');
  });

  it('keeps the earlier result on a tie (ɦʊkəm is one edit from both ḥukm and ḥakam)', () => {
    const r = selectDsalResult([mk('ḥukm'), mk('ḥakam')], 'ɦʊkəm');
    expect(r!.roman).toBe('ḥukm');
  });

  it('handles multi-vocalization roman fields ("shag̠ẖl, shug̠ẖl") by best part', () => {
    const r = selectDsalResult([mk('shag̠ẖl, shug̠ẖl'), mk('totally-wrong')], 'səgəl');
    expect(r!.roman).toBe('shag̠ẖl, shug̠ẖl');
  });

  it('returns the single result unchanged and null for none', () => {
    expect(selectDsalResult([mk('qudrat')], 'anything')!.roman).toBe('qudrat');
    expect(selectDsalResult([], 'anything')).toBeNull();
  });
});

describe('foldForMatch', () => {
  it('folds dictionary romanization and Gurmukhi IPA into the same skeleton', () => {
    expect(foldForMatch('shaiḵẖ')).toBe(foldForMatch('seːkʰ'));
    expect(foldForMatch('karam')).toBe(foldForMatch('kəɾəm'));
    expect(foldForMatch('ṣūr')).toBe(foldForMatch('suːɾ'));
    expect(foldForMatch('nāhī')).toBe(foldForMatch('n̪aːɦiː'));
  });

  it('drops ayn/hamza marks from romanizations', () => {
    expect(foldForMatch('sāʻī')).toBe(foldForMatch('saːiː'));
  });
});

describe('stripArabicDiacritics', () => {
  it('removes harakat so vocalized Mahan Kosh quotes match DSAL headwords', () => {
    expect(stripArabicDiacritics('حُکم')).toBe('حکم');
    expect(stripArabicDiacritics('قُدرت')).toBe('قدرت');
    expect(stripArabicDiacritics('صوُر')).toBe('صور');
  });

  it('removes shadda', () => {
    expect(stripArabicDiacritics('مشّقت')).toBe('مشقت');
  });
});

describe('headwordVariants', () => {
  it('yields both Farsi-kāf and Arabic-kāf spellings (DSAL is inconsistent per headword)', () => {
    const v = headwordVariants('حُکم');
    expect(v).toContain('حکم'); // Farsi kāf U+06A9
    expect(v).toContain('حكم'); // Arabic kāf U+0643
  });

  it('maps Urdu he (ہ) to Persian he (ه) — Steingass has ناهی, Mahan Kosh quotes ناہی', () => {
    const v = headwordVariants('ناہی');
    expect(v).toContain('ناهی');
  });

  it('deduplicates when no convertible characters are present', () => {
    expect(headwordVariants('قدرت')).toEqual(['قدرت']);
  });

  it('puts the diacritic-stripped original first', () => {
    expect(headwordVariants('حُکم')[0]).toBe('حکم');
  });
});
