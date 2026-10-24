// Chandi Charitar II → corpus lines.
//
// Source: "Chandi_Charitar_Part_2.pdf" (Google Drive id 1Viw3It4-7al6fbN9W75J9KGzFPKW-9us), pages
// 131-157 cut from a Punjabi-translated Sri Dasam Granth, its verse extracted and converted by
// extract.py. See README.md for the decisions this follows.
//
// Lines follow the Dasam Bani and Sarbloh convention: one tuk (half-line) per row, ending in " ॥" or
// in its verse numbers in Gurmukhi digits. The print counts each verse within its chapter and
// through the work ("। 1। 39।" → "॥੧॥੩੯॥"); chapter 1 carries only the one count. A chhand label is
// a row of its own ("ਨਰਾਜ ਛੰਦ ॥"), and so are the work's headings ("ਅਥ ਧੂਮਨੈਨ ਜੁਧ ਕਥਨ ॥") and each
// chapter's colophon, joined from its two printed lines.

import { splitTuks } from "../gur-sobha/lines";
import { sectionIndexes } from "../sarbloh/lines";

export interface ExtractLine {
  page: number;
  /** "text": the verse font (verse and the work's headings); "label": rubric, chhand labels, colophons. */
  role: "text" | "label";
  gurmukhi: string;
}

export interface CorpusLine {
  verse_id: number;
  ang: number;
  line_no: number;
  shabad_id: number;
  gurmukhi: string;
  /** The chapter (ਧਿਆਇ), 1-8, counted by colophons. Not stored in `lines`; for checking. */
  chapter: number;
}

/** Printed page − PDF page: the running heads number pp. 132-157 on PDF pages 2-27. */
export const PAGE_OFFSET = 130;
/**
 * Shabad ids are CHANDI_2_SHABAD_BASE + 1, + 2, ... in reading order: ours. Ids in use: SGGS 1-5540,
 * Dasam 7402+, Bhai Gurdas 40001+, Sarbloh 900001-901559, Nand Lal 910061, Gur Sobha 920001-920483,
 * Bhai Gurdas Singh's vaar 930001-930028 (open PR #307).
 */
export const CHANDI_2_SHABAD_BASE = 940000;

/** Chhand names as this print spells them, beyond Sarbloh's list, → the chhand they name. */
const LOCAL_CHHANDS: Record<string, string> = { ਰਸਾਲਵ: "ਰਸਾਵਲ" };

/**
 * The print's verse numbers closed in double dandas ("। 1। 39।" → "॥1॥39॥"), a last number printed
 * without its danda given one, and runs of spaces closed up. Also repaired, each checked against the
 * page image (README.md): footnote marks set in the verse or label font (a digit right after a
 * letter), the raised spacing mark typed '&' ('=' once converted) inside ਉ‐ਠੇ, ਮੰ‐ਡੇ and ਉ‐ਚੰ, a
 * stray dot before a word, and a vowel sign typed twice.
 */
export function cleanText(text: string): string {
  return text
    .replace(/([ਁ-ੵ])[0-9]+(?=\s|$)/g, "$1")
    .replace(/=/g, "")
    .replace(/(^|\s)\.(?=[ਅ-ਹ])/g, "$1")
    .replace(/([ਾ-ੌ])\1+/g, "$1")
    .replace(/([0-9])\s*$/, "$1।")
    .replace(/।?\s*([0-9]+)\s*।/g, "॥$1॥")
    .replace(/॥+/g, "॥")
    .replace(/\s+/g, " ")
    .trim();
}

const COLOPHON = /^ਇਤਿ\s/;
const closed = (t: string) => /[।॥]\s*$/.test(t);

/** The extract's lines (reading order) → corpus lines. */
export function toLines(extract: ExtractLine[]): CorpusLine[] {
  const rows: Array<{ gurmukhi: string; ang: number; chapter: number }> = [];
  let chapter = 1;
  for (let i = 0; i < extract.length; i++) {
    const l = extract[i];
    let t = cleanText(l.gurmukhi);
    const ang = l.page + PAGE_OFFSET;
    if (l.role === "label" && COLOPHON.test(t)) {
      // a colophon runs onto the next label line until it closes on its chapter number
      while (!closed(t) && extract[i + 1]?.role === "label") t = `${t} ${cleanText(extract[++i].gurmukhi)}`;
      for (const tuk of splitTuks(t.replace(/।/g, " "))) rows.push({ gurmukhi: tuk, ang, chapter });
      chapter++;
      continue;
    }
    if (!closed(t)) {
      // a chhand label or heading: a row of its own
      rows.push({ gurmukhi: `${t} ॥`, ang, chapter });
      continue;
    }
    for (const tuk of splitTuks(t)) rows.push({ gurmukhi: tuk, ang, chapter });
  }
  // Sections as Sarbloh has them (one per run of one chhand, or per titled section), with labels read
  // through this print's spellings, and a new one at each chapter.
  const forSections = rows.map((r) => ({
    gurmukhi: r.gurmukhi.split(" ").map((w) => LOCAL_CHHANDS[w] ?? w).join(" "),
  }));
  const sections = sectionIndexes(forSections);
  let section = 0;
  return rows.map((r, k) => {
    if (k > 0 && (sections[k] !== sections[k - 1] || r.chapter !== rows[k - 1].chapter)) section++;
    return {
      verse_id: k + 1,
      ang: r.ang,
      line_no: k + 1,
      shabad_id: CHANDI_2_SHABAD_BASE + 1 + section,
      gurmukhi: r.gurmukhi,
      chapter: r.chapter,
    };
  });
}
