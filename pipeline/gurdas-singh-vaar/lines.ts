// Bhai Gurdas Singh's vaar (ਵਾਹ ਵਾਹ ਗੋਬਿੰਦ ਸਿੰਘ ਆਪੇ ਗੁਰੁ ਚੇਲਾ) → corpus lines.
//
// Source: "Vaar Bhagauti - Bhai Gurdas Singh.pdf" (Google Drive id 1bK_ozg_3Fy_e4EytWhm65vwuFxLc5pn5),
// typed in GurbaniLipi, its text layer extracted and converted by extract.py. See README.md.
//
// Every printed line is one tuk and ends in " ॥", or in its pauri number. The print has no chhand
// labels: pauris 1-20 close on the refrain, 21-28 are chaupai closing on "ਹੇ ਸਤਿਗੁਰੁ ਮੁਹਿ ਲੇਹੁ
// ਉਬਾਰਾ". One shabad per pauri. The text is kept as printed, misprints included (README.md).

export interface ExtractLine {
  page: number;
  gurmukhi: string;
}

export interface CorpusLine {
  verse_id: number;
  ang: number;
  line_no: number;
  shabad_id: number;
  gurmukhi: string;
  /** The pauri, 1-28, as numbered at its close. Not stored in `lines`; for checking. */
  pauri: number;
}

/**
 * Shabad ids are GURDAS_SINGH_SHABAD_BASE + the pauri number: ours. Ids in use: SGGS 1-5540,
 * Dasam 7402+, Bhai Gurdas 40001+ (BaniDB's own S source, not loaded, has 41000-41027), Sarbloh
 * 900001-901559, Nand Lal ghazal 61 at 910061, Gur Sobha 920001-920483.
 */
export const GURDAS_SINGH_SHABAD_BASE = 930000;

const DIGITS = "੦੧੨੩੪੫੬੭੮੯";
const toInt = (g: string) => Number([...g].map((d) => DIGITS.indexOf(d)).join(""));

/** Spacing only: "॥ ੧ ॥" closes up to "॥੧॥", as the other corpora write it. */
export function cleanText(text: string): string {
  return text
    .replace(/॥\s*([੦-੯]+)\s*॥/g, "॥$1॥")
    .replace(/\s+/g, " ")
    .trim();
}

/** The number closing a pauri ("… ਚੇਲਾ ॥੧੪॥" → 14), or null. */
export function pauriNumber(line: string): number | null {
  const m = /॥([੦-੯]+)॥$/.exec(line);
  return m ? toInt(m[1]) : null;
}

/** The extract's lines (reading order) → corpus lines, one per printed line. */
export function toLines(extract: ExtractLine[]): CorpusLine[] {
  const out: CorpusLine[] = [];
  let pauri = 1;
  extract.forEach((l, k) => {
    const gurmukhi = cleanText(l.gurmukhi);
    out.push({
      verse_id: k + 1,
      ang: l.page,
      line_no: k + 1,
      shabad_id: GURDAS_SINGH_SHABAD_BASE + pauri,
      gurmukhi,
      pauri,
    });
    if (pauriNumber(gurmukhi) !== null) pauri++;
  });
  return out;
}
