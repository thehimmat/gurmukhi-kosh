/**
 * Bhai Nand Lal's Ghazals (Diwan-e-Goya) in Gurmukhi, from "Ghazals Bhai Nand Laal Goyaa Complete.pdf"
 * (canonical by decision, 2026-10-18; BaniDB source N is a variant). See supabase/migrations/061.
 *
 * Input is the PDF's text layer converted from GurbaniAkhar to Unicode: a "ਗ਼ਜ਼ਲ N" heading per ghazal,
 * then shers whose two misras end in "।" and "॥N॥". The PDF wraps long misras, sometimes mistypes the
 * marks (।੧॥, or the mark on a line of its own), and five shers lack the mark between their misras.
 * The rubaiyan and baints after ghazal 63 start at a "ੴ" line, where parsing stops.
 *
 * One row per misra, as for Dasam Bani and Sarbloh: ang = ghazal, shabad_id = GHAZAL_SHABAD_BASE + ghazal,
 * verse_id = line_no = the running misra number. A row's sher is sherPosition(its position in the ghazal).
 */

/** 910001-910063. Shabad ids in use: SGGS 1-5540, Dasam 7402+, Bhai Gurdas 40001+, Sarbloh 900001-901564. */
export const GHAZAL_SHABAD_BASE = 910000;

export type Misra = { ghazal: number; sher: number; misra: 1 | 2; text: string };
export type GhazalLine = { verse_id: number; ang: number; line_no: number; shabad_id: number; gurmukhi: string };

const GURMUKHI_DIGITS = "੦੧੨੩੪੫੬੭੮੯";
const toGurmukhiDigits = (n: number) => String(n).replace(/\d/g, (d) => GURMUKHI_DIGITS[+d]);
const fromGurmukhiDigits = (s: string) => Number(s.replace(/[੦-੯]/g, (d) => String(GURMUKHI_DIGITS.indexOf(d))));

const HEADING = /^\u0a5a\u0a5bਲ ([੦-੯]+)$/; // ਗ਼ਜ਼ਲ
const SHER_END = /\s*[।॥]\s*([੦-੯]+)\s*[।॥]\s*$/;
/**
 * Where a sher splits, in order of preference: a danda ending a PDF line (a danda inside a line can be
 * an interjection, as in ghazal 34's "ਐ ਜ਼ਹੇ ।"), a misra-closing "?" or "--" ending a line, then a
 * danda anywhere. Group 1 is what stays with the first misra.
 */
const SPLITS = [/()\s*[।॥]\s*\n\s*/, /(\?|--)\s*\n\s*/, /()\s*[।॥]\s*(?=\S)/];

const NUKTA = "਼";
// Escaped: editors and NFC normalisation split these back into letter + nukta (U+0A59-5E are
// composition-excluded), which is the form this step exists to remove.
const PRECOMPOSED: Record<string, string> = { ਖ: "\u0a59", ਗ: "\u0a5a", ਜ: "\u0a5b", ਫ: "\u0a5e", ਲ: "\u0a33", ਸ: "\u0a36" };

/** Letter + nukta → the precomposed letter, for the six that Unicode has. */
export function composeNukta(s: string): string {
  return s.replace(new RegExp(`([ਖਗਜਫਲਸ])${NUKTA}`, "g"), (_, c: string) => PRECOMPOSED[c]);
}

/**
 * One misra as the corpus stores it, without its closing mark. Drops the edition's commas, quote marks,
 * "?", "--", "!" and brackets; keeps "ਕਿ:" and hyphenated compounds. Nukta letters are written as in the
 * BaniDB corpora: precomposed (ਖ਼ ਗ਼ ਜ਼ ਫ਼ ਲ਼ ਸ਼), and other letters (ਕ਼ for qaf, ਅ਼ for ain) without the nukta.
 */
export function cleanMisra(raw: string): string {
  return composeNukta(raw)
    .replace(/-\s*\n\s*/g, "-")
    .replaceAll(NUKTA, "")
    .replace(/ਅਾ/g, "ਆ")
    .replace(/--/g, " ")
    .replace(/[,'"?!.()।॥]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitSher(body: string, where: string): [string, string] {
  let parts: string[] | null = null;
  for (const re of SPLITS) {
    const m = re.exec(body);
    if (m) {
      parts = [body.slice(0, m.index) + m[1], body.slice(m.index + m[0].length)];
      break;
    }
  }
  parts ??= body.split("\n").length === 2 ? body.split("\n") : null;
  if (!parts) throw new Error(`${where}: cannot split into two misras: ${body.replace(/\n/g, " / ")}`);
  const [a, b] = parts.map(cleanMisra);
  if (!a || !b) throw new Error(`${where}: empty misra: ${body.replace(/\n/g, " / ")}`);
  return [a, b];
}

export function parseGhazals(text: string): Misra[] {
  const out: Misra[] = [];
  let ghazal = 0;
  let sher = 0;
  let buf: string[] = [];
  const finishGhazal = () => {
    if (buf.length) throw new Error(`ghazal ${ghazal}: unfinished sher: ${buf.join(" / ")}`);
  };

  for (const raw of composeNukta(text).replace(/\f/g, "\n").split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const heading = HEADING.exec(line);
    if (heading) {
      finishGhazal();
      const n = fromGurmukhiDigits(heading[1]);
      if (n !== ghazal + 1) throw new Error(`ghazal ${n} where ${ghazal + 1} was expected`);
      ghazal = n;
      sher = 0;
      continue;
    }
    if (line.startsWith("ੴ")) break;
    if (!ghazal) continue; // the title before ghazal 1

    buf.push(line);
    const end = SHER_END.exec(buf.join("\n"));
    if (!end) continue;
    const n = fromGurmukhiDigits(end[1]);
    if (n !== sher + 1) throw new Error(`ghazal ${ghazal}: sher ${n} where ${sher + 1} was expected`);
    sher = n;
    const body = buf.join("\n").slice(0, end.index).trim();
    buf = [];
    const [a, b] = splitSher(body, `ghazal ${ghazal}, sher ${sher}`);
    out.push({ ghazal, sher, misra: 1, text: a }, { ghazal, sher, misra: 2, text: b });
  }
  finishGhazal();
  return out;
}

export function toLines(misras: Misra[]): GhazalLine[] {
  return misras.map((m, i) => ({
    verse_id: i + 1,
    ang: m.ghazal,
    line_no: i + 1,
    shabad_id: GHAZAL_SHABAD_BASE + m.ghazal,
    gurmukhi: m.misra === 1 ? `${m.text} ।` : `${m.text} ॥${toGurmukhiDigits(m.sher)}॥`,
  }));
}

/** Sher and misra of the k-th row (1-based) of a ghazal: every sher is two rows. */
export function sherPosition(k: number): { sher: number; misra: 1 | 2 } {
  return { sher: Math.ceil(k / 2), misra: k % 2 === 1 ? 1 : 2 };
}
