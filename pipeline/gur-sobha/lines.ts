// Sri Gur Sobha (Kavi Sainapati) → corpus lines.
//
// Source: the Institute of Sikh Studies edition (Chandigarh, 2014; Google Drive id
// 14ER61YCHhfk9bknSd8-wJDx44yVTTCFN), its Asees text layer extracted and converted by extract.py.
// See README.md for the decisions this follows.
//
// Lines follow the Dasam Bani and Sarbloh convention: one tuk per row, ending in " ॥" or in its
// verse numbers in Gurmukhi digits (the edition counts each verse within its chapter and through
// the whole work: "… ॥੩੮॥੭੯॥"). A chhand label is a row of its own ("ਦੋਹਰਾ ॥"). The edition's
// commas and quotation marks stay in the text; wordText drops them for counting words.

import { composeNukta } from "../nand-lal/ghazals";
import { CHHANDS, sectionIndexes } from "../sarbloh/lines";

export interface ExtractLine {
  page: number;
  /** On one of the edition's REFERENCES pages: a quotation in a note, not the text. */
  notes: boolean;
  /** Printed bold: the edition's own headings (chapter titles, summaries, dates). */
  bold: boolean;
  gurmukhi: string;
}

export interface CorpusLine {
  verse_id: number;
  ang: number;
  line_no: number;
  shabad_id: number;
  gurmukhi: string;
  /** The chapter (ਧਿਆਇ), 1-20, counted by colophons. Not stored in `lines`; for checking. */
  chapter: number;
}

/** PDF page − printed page: constant over the edition's 153 numbered pages. */
export const PAGE_OFFSET = 44;
/** The work's 20 chapters each end in a colophon (ਇਤਿ ਸ੍ਰੀ ਗੁਰ ਸੋਭਾ …); after the last come the notes. */
export const CHAPTERS = 20;
/**
 * Gur Sobha shabad ids are GUR_SOBHA_SHABAD_BASE + 1, + 2, ... in reading order: ours, as no source
 * publishes any. Ids in use: SGGS 1-5540, Dasam 7402+, Bhai Gurdas 40001+, Sarbloh 900001-901559,
 * Nand Lal ghazal 61 at 910061.
 */
export const GUR_SOBHA_SHABAD_BASE = 920000;

const DIGITS = "੦੧੨੩੪੫੬੭੮੯";
const toGurmukhi = (n: string) => n.replace(/[0-9]/g, (d) => DIGITS[+d]);
const VOWEL_SIGNS = "ਾਿੀੁੂੇੈੋੌ";

/** Chhand names as this edition spells them, beyond Sarbloh's list, → the chhand they name. */
const GUR_SOBHA_CHHANDS: Record<string, string> = {
  ਚੋਪਈ: "ਚੌਪਈ", ਦੌਹਰਾ: "ਦੋਹਰਾ", ਪਊੜੀ: "ਪਉੜੀ", ਪੌੜੀ: "ਪਉੜੀ", ਕਬਿੱਤੁ: "ਕਬਿੱਤ",
};
const chhandName = (w: string): string | null => GUR_SOBHA_CHHANDS[w] ?? (CHHANDS[w] || null);

/**
 * Repair the edition's typing slips, each checked against the page image or the edition's own
 * romanisation (README.md):
 * - '||' typed for ']]' converts to ਫ਼ਫ਼: it is the double danda, as is a danda ('.') typed before a
 *   verse number (ਕਾਮ। 21॥317॥);
 * - a vowel sign typed twice is one; ੈ stacked with ੇ prints as ੈ;
 * - a kanaura after another vowel sign is the closing quote '"' typed in Asees (ਲੀਜਿਯੈ”, romanised
 *   lîjiyai’’), a run of them one quote;
 * - a sihari stranded before kanna is dropped (ਮਿਲਿਾਇ prints ਮਿਲਾਇ);
 * - addak before aunkar is put after it, as Unicode orders them.
 */
export function cleanText(text: string): string {
  return composeNukta(text)
    .replace(/(?:\u0A5E|\u0A2B\u0A3C){2}/g, "॥") // ਫ਼ਫ਼, composed or not
    .replace(/।\s*(?=[0-9]+\s*॥)/g, "॥")
    .replace(new RegExp(`([${VOWEL_SIGNS}])ੌ+`, "g"), "$1”")
    .replace(/([ਾ-ੌ])\1+/g, "$1")
    .replace(/ੈੇ|ੇੈ/g, "ੈ")
    .replace(/ਿਾ/g, "ਾ")
    .replace(/ੱ([ੁੂ])/g, "$1ੱ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * A printed line (cleaned) → its tuks, each ending " ॥" or in its verse numbers (॥੧॥, ॥੨॥੪੩॥). A
 * line ends a tuk at each danda; a line without one (a kabitt line ending in a comma) is one tuk.
 */
export function splitTuks(text: string): string[] {
  const out: string[] = [];
  // a tuk, then its ending: a danda, or ॥ with verse numbers, or the end of the line
  const re = /([^।॥]+?)\s*(।|॥\s*(?:[0-9]+\s*॥\s*)*|$)(\s*[”’"]*)/g;
  for (const m of text.matchAll(re)) {
    let body = m[1].trim();
    const end = m[2];
    const quote = m[3].trim();
    if (!body) continue;
    const nums = [...end.matchAll(/[0-9]+/g)].map((n) => n[0]);
    body = body.replace(/[,;]$/, "").trim();
    const ending = nums.length ? `॥${nums.map(toGurmukhi).join("॥")}॥` : "॥";
    out.push(`${body} ${ending}${quote}`);
    if (!m[0]) break;
  }
  return out;
}

const COLOPHON = /^ਇਤਿ\s/;
/** A chhand label opening a printed line: "ਦੋਹਰਾ:", "ਛਪੈ ਛੰਦ:", "ਕਬਿਤੁ :", or the whole line ("ਮਧੁਭਾਰ ਛੰਦ"). */
function labelOf(text: string): { label: string; rest: string } | null {
  const m = /^(\S+(?: ਛੰਦ)?)\s*:\s*(.*)$/.exec(text) ?? /^(\S+ ਛੰਦ)()$/.exec(text);
  if (!m) return null;
  const first = m[1].split(" ")[0];
  if (!chhandName(first) && !m[1].endsWith(" ਛੰਦ")) return null;
  return { label: m[1], rest: m[2] };
}
const endsVerse = (text: string) => /॥\s*$/.test(text) || /[0-9]\s*॥?\s*$/.test(text);

/**
 * The extract's lines (reading order) → corpus lines, through the colophon of chapter `chapters`.
 * Left out: the edition's bold headings (but for the work's opening rubric, before its first verse),
 * quotations on its REFERENCES pages, and everything after the last colophon.
 */
export function toLines(extract: ExtractLine[], chapters = CHAPTERS): CorpusLine[] {
  const rows: Array<{ gurmukhi: string; ang: number; chapter: number; header?: string }> = [];
  let chapter = 1;
  let opened = false; // the first verse line has been read
  for (let i = 0; i < extract.length && chapter <= chapters; i++) {
    const l = extract[i];
    if (l.notes || (l.bold && opened)) continue;
    let text = cleanText(l.gurmukhi);
    const ang = l.page - PAGE_OFFSET;
    if (COLOPHON.test(text)) {
      // A colophon runs onto the next line when it hasn't closed (॥) and that line is plain text.
      while (!endsVerse(text) && i + 1 < extract.length) {
        const next = extract[i + 1];
        const nt = cleanText(next.gurmukhi);
        if (next.bold || next.notes || labelOf(nt) || COLOPHON.test(nt)) break;
        text = `${text} ${nt}`;
        i++;
      }
      for (const t of splitTuks(text.replace(/।/g, " "))) rows.push({ gurmukhi: t, ang, chapter });
      chapter++;
      continue;
    }
    if (!l.bold) opened = true;
    const label = labelOf(text);
    if (label) {
      rows.push({ gurmukhi: `${label.label} ॥`, ang, chapter, header: label.label });
      text = label.rest;
    }
    for (const t of splitTuks(text)) rows.push({ gurmukhi: t, ang, chapter });
  }
  // Sections as Sarbloh has them (one per run of one chhand, or per titled section), with labels
  // read through this edition's spellings, and a new one at each chapter.
  const forSections = rows.map((r) =>
    r.header ? { gurmukhi: `${r.header.split(" ").map((w) => chhandName(w) ?? w).join(" ")} ॥` } : r,
  );
  const sections = sectionIndexes(forSections);
  let section = 0;
  const ids: number[] = [];
  rows.forEach((r, k) => {
    if (k > 0 && (sections[k] !== sections[k - 1] || r.chapter !== rows[k - 1].chapter)) section++;
    ids.push(GUR_SOBHA_SHABAD_BASE + 1 + section);
  });
  return rows.map((r, k) => ({
    verse_id: k + 1,
    ang: r.ang,
    line_no: k + 1,
    shabad_id: ids[k],
    gurmukhi: r.gurmukhi,
    chapter: r.chapter,
  }));
}

/** The text words are counted from: without the edition's commas, quotes and other punctuation. */
export function wordText(line: string): string {
  return line
    .replace(/[,;:'"“”‘’?!.()–-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
