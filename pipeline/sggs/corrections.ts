/**
 * BaniDB lines we know are mistyped, checked against printed sources. The ingest swaps the
 * corrected line in for BaniDB's, so a re-ingest keeps the fix; migrations 073 (TYPOS), 076 (NASAL),
 * 077 (NASAL_HI, both in nasal-corrections.ts) and 078 (FOLLOW_UPS) fixed the copy already loaded.
 * A verse can have more than one entry: each applies to what the one before it produced. Each entry matches BaniDB's whole line: once BaniDB corrects a line itself,
 * the entry stops matching and the ingest takes BaniDB's text and reports the entry as stale.
 *
 * Reported upstream: thehimmat/inbox#91. Sources and page images are indexed in the Drive doc
 * "Dasam Granth — scan index & BaniDB spelling checks (v2)".
 *
 * - 1912: the 1912 CE print of the Sodhak Committee text (archive.org 1912ce-dasam-granth),
 *   printed page number; PDF leaf = page + 23.
 * - Hazur Sahib: the Hazur Sahib larivaar edition of the same text
 *   (archive.org dasam-guru-granth-sahib-hazur-sahib_202306), printed page number.
 * - Ugardanti pothi: 19th-c. manuscript (archive.org uggardanti_pothi), PDF page.
 */

import { NASAL, NASAL_HI } from "./nasal-corrections";

export type LineCorrection = {
  verseId: number;
  ang: number;
  from: string;
  to: string;
  translitFrom: string;
  translitTo: string;
  evidence: string;
};

// A sihari typed before a letter, attached to the letter before it (legacy-font conversion).
const SIHARI = "sihari on the wrong letter (legacy-font conversion)";
// Charitar 266 is about bhang; BaniDB has ਭਾਗ (fortune) for ਭਾਂਗ throughout it.
const BHANG = "ਭਾਂਗ (bhang), not ਭਾਗ";

export const TYPOS: LineCorrection[] = [
  {
    verseId: 80315, ang: 126,
    from: "ਦੁਹਾ ਕੰਧਾਰਾ ਮੁਿਹ ਜੁੜੇ ਅਣੀਆਰਾ ਚੋਈਆਂ ॥",
    to: "ਦੁਹਾ ਕੰਧਾਰਾ ਮੁਹਿ ਜੁੜੇ ਅਣੀਆਰਾ ਚੋਈਆਂ ॥",
    translitFrom: "dhuhaa ka(n)dhaaraa mueh juRe aneeaaraa choieeaa(n) ||",
    translitTo: "dhuhaa ka(n)dhaaraa muh juRe aneeaaraa choieeaa(n) ||",
    evidence: `${SIHARI}; 1912 p.119, pauri 42`,
  },
  {
    verseId: 80317, ang: 126,
    from: "ਹੂਰਾਂ ਸ੍ਰਣਵਤ ਬੀਜ ਨੰੂ ਘਤਿ ਘੇਿਰ ਖਲੋਈਆਂ ॥",
    to: "ਹੂਰਾਂ ਸ੍ਰਣਵਤ ਬੀਜ ਨੰੂ ਘਤਿ ਘੇਰਿ ਖਲੋਈਆਂ ॥",
    translitFrom: "hooraa(n) sranavat beej na(n)oo ghat ghir khaloieeaa(n) ||",
    translitTo: "hooraa(n) sranavat beej na(n)oo ghat gher khaloieeaa(n) ||",
    evidence: `${SIHARI}; 1912 p.119, pauri 42`,
  },
  {
    verseId: 130072, ang: 1194,
    from: "ਤਾਂੈ ਹਮਰੀ ਬਾਤ ਕਹ ਜਾਨੈ ॥",
    to: "ਤੈਂ ਹਮਰੀ ਬਾਤ ਨ ਕਹਾ ਜਾਨੈ ॥",
    translitFrom: "taa(n)ai hamaree baat keh jaanai ||",
    translitTo: "tai(n) hamaree baat na kahaa jaanai ||",
    evidence: "ਤਾਂੈ for ਤੈਂ, and ਨ dropped with ਕਹ for ਕਹਾ; 1912 p.1177 and Hazur Sahib p.1198, Charitar 266",
  },
  {
    verseId: 130073, ang: 1194,
    from: "ਭਾਗ ਖਾਇ ਕੈ ਬੈਨ ਪ੍ਰਮਾਨੈ ॥੩੬॥",
    to: "ਭਾਂਗ ਖਾਇ ਕੈ ਬੈਨ ਪ੍ਰਮਾਨੈ ॥੩੬॥",
    translitFrom: "bhaag khai kai bain pramaanai ||36||",
    translitTo: "bhaa(n)g khai kai bain pramaanai ||36||",
    evidence: `${BHANG}; 1912 p.1177 and Hazur Sahib p.1198`,
  },
  {
    verseId: 130077, ang: 1194,
    from: "ਭਾਗ ਪੀਏ ਬੁਧਿ ਜਾਤ ਨ ਹਰੀ ॥",
    to: "ਭਾਂਗ ਪੀਏ ਬੁਧਿ ਜਾਤ ਨ ਹਰੀ ॥",
    translitFrom: "bhaag pe'ee budh jaat na haree ||",
    translitTo: "bhaa(n)g pe'ee budh jaat na haree ||",
    evidence: `${BHANG}; Hazur Sahib p.1198`,
  },
  {
    verseId: 130080, ang: 1194,
    from: "ਕਬ ਹੀ ਭੂਲਿ ਨ ਭਾਗ ਚੜਾਵਤ ॥",
    to: "ਕਬ ਹੀ ਭੂਲਿ ਨ ਭਾਂਗ ਚੜਾਵਤ ॥",
    translitFrom: "kab hee bhool na bhaag chaRaavat ||",
    translitTo: "kab hee bhool na bhaa(n)g chaRaavat ||",
    evidence: `${BHANG}; Hazur Sahib p.1198`,
  },
  {
    verseId: 130171, ang: 1196,
    from: "ਭਾਗ ਨ ਏਤੇ ਪਰ ਭਖੈ ਜਾਨਤ ਆਪ ਸੁਚੇਤ ॥੫੮॥",
    to: "ਭਾਂਗ ਨ ਏਤੇ ਪਰ ਭਖੈ ਜਾਨਤ ਆਪ ਸੁਚੇਤ ॥੫੮॥",
    translitFrom: "bhaag na ete par bhakhai jaanat aap suchet ||58||",
    translitTo: "bhaa(n)g na ete par bhakhai jaanat aap suchet ||58||",
    evidence: `${BHANG}; Hazur Sahib p.1200`,
  },
  {
    verseId: 130263, ang: 1198,
    from: "ਕਹਾ ਭਯੌ ਜੌ ਭਾਗ ਭੂਲਿ ਭੌਂਦੂ ਨਹਿ ਖਾਈ ॥",
    to: "ਕਹਾ ਭਯੌ ਜੌ ਭਾਂਗ ਭੂਲਿ ਭੌਂਦੂ ਨਹਿ ਖਾਈ ॥",
    translitFrom: "kahaa bhayau jau bhaag bhool bhaua(n)dhoo neh khaiee ||",
    translitTo: "kahaa bhayau jau bhaa(n)g bhool bhaua(n)dhoo neh khaiee ||",
    evidence: `${BHANG}; Hazur Sahib p.1201`,
  },
  {
    verseId: 130265, ang: 1198,
    from: "ਭਾਗ ਖਾਇ ਭਟ ਭਿੜਹਿ ਗਜਨ ਕੇ ਦਾਤ ਉਪਾਰਹਿ ॥",
    to: "ਭਾਂਗ ਖਾਇ ਭਟ ਭਿੜਹਿ ਗਜਨ ਕੇ ਦਾਤ ਉਪਾਰਹਿ ॥",
    translitFrom: "bhaag khai bhaT bhiReh gajan ke dhaat upaareh ||",
    translitTo: "bhaa(n)g khai bhaT bhiReh gajan ke dhaat upaareh ||",
    evidence: `${BHANG}; Hazur Sahib p.1201`,
  },
  {
    verseId: 130267, ang: 1198,
    from: "ਤੈ ਮੂਜੀ ਪੀ ਭਾਗ ਕਹੋ ਕਾ ਕਾਜ ਸਵਰਿ ਹੈਂ ॥",
    to: "ਤੈ ਮੂਜੀ ਪੀ ਭਾਂਗ ਕਹੋ ਕਾ ਕਾਜ ਸਵਰਿ ਹੈਂ ॥",
    translitFrom: "tai moojee pee bhaag kaho kaa kaaj savar hai(n) ||",
    translitTo: "tai moojee pee bhaa(n)g kaho kaa kaaj savar hai(n) ||",
    evidence: `${BHANG}; Hazur Sahib p.1202`,
  },
  {
    verseId: 141915, ang: 1428,
    from: "ਨਮੋ ਰਿੱਧ ਦਾ ਸਿੱਧਿ ਦਾ ਬੁੱਿਧ ਦੈਨੀ ॥",
    to: "ਨਮੋ ਰਿੱਧ ਦਾ ਸਿੱਧਿ ਦਾ ਬੁੱਧਿ ਦੈਨੀ ॥",
    translitFrom: "namo ri'dh dhaa si'dh dhaa bu'idh dhainee ||",
    translitTo: "namo ri'dh dhaa si'dh dhaa bu'dh dhainee ||",
    evidence: `${SIHARI}; Ugardanti pothi PDF p.23 (not in the Sodhak text)`,
  },
  {
    verseId: 402922, ang: 1428,
    from: "ਜੋਉੂ ਮਯਾਨ ਤੇ ਵੀਰ ਤੋ ਕੋ ਸੜੱਕੈ ॥",
    to: "ਜੋਊ ਮਯਾਨ ਤੇ ਵੀਰ ਤੋ ਕੋ ਸੜੱਕੈ ॥",
    translitFrom: "joauoo mayaan te veer to ko saRa'kai ||",
    translitTo: "jouoo mayaan te veer to ko saRa'kai ||",
    evidence: "ਉ + ੂ stored for ਊ: reads the same on screen, but search and word counts split it",
  },
];

// Second corrections of lines already corrected above; `from` is the earlier entry's `to`.
export const FOLLOW_UPS: LineCorrection[] = [
  {
    verseId: 130267, ang: 1198,
    from: "ਤੈ ਮੂਜੀ ਪੀ ਭਾਂਗ ਕਹੋ ਕਾ ਕਾਜ ਸਵਰਿ ਹੈਂ ॥",
    to: "ਤੈਂ ਮੂਜੀ ਪੀ ਭਾਂਗ ਕਹੋ ਕਾ ਕਾਜ ਸਵਰਿ ਹੈਂ ॥",
    translitFrom: "tai moojee pee bhaa(n)g kaho kaa kaaj savar hai(n) ||",
    translitTo: "tai(n) moojee pee bhaa(n)g kaho kaa kaaj savar hai(n) ||",
    evidence: "ਤੈ → ਤੈਂ: Hazur Sahib p.1202 and 1912 p.1181 (leaf 1204) both have the bindi (#310)",
  },
];

export const CORRECTIONS: Record<string, LineCorrection[]> = {
  dasam_banidb_v2: [...TYPOS, ...NASAL, ...NASAL_HI, ...FOLLOW_UPS],
};

export type CorrectedLine = {
  gurmukhi: string;
  transliteration: string | null;
  status: "none" | "corrected" | "stale";
};

/** BaniDB's line, or our correction of it when we have one and BaniDB still reads as recorded. */
export function correctLine(
  sourceCode: string,
  verseId: number,
  gurmukhi: string,
  transliteration: string | null,
): CorrectedLine {
  const entries = CORRECTIONS[sourceCode]?.filter((x) => x.verseId === verseId) ?? [];
  if (!entries.length) return { gurmukhi, transliteration, status: "none" };
  if (gurmukhi !== entries[0].from) return { gurmukhi, transliteration, status: "stale" };
  let line = { gurmukhi, transliteration };
  for (const c of entries) {
    if (line.gurmukhi === c.from) line = { gurmukhi: c.to, transliteration: c.translitTo };
  }
  return { ...line, status: "corrected" };
}
