/**
 * Bhai Nand Lal's Ghazals (Diwan-e-Goya) in Gurmukhi, from "Ghazals Bhai Nand Laal Goyaa Complete.pdf"
 * (canonical by decision, 2026-10-18; BaniDB source N is a variant). See supabase/migrations/061 and README.md.
 *
 * Input is the PDF's text layer converted from GurbaniAkhar to Unicode: a "ਗ਼ਜ਼ਲ N" heading per ghazal,
 * then shers whose two misras end in "।" and "॥N॥". The PDF wraps long misras, sometimes mistypes the
 * marks (।੧॥, or the mark on a line of its own), and five shers lack the mark between their misras.
 * The rubaiyan and baints after ghazal 63 start at a "ੴ" line, where parsing stops.
 *
 * The text is kept as printed (user decision, 2026-10-18): punctuation, quote marks and every nukta.
 * wordText gives the same line without the punctuation, for counting words.
 *
 * One row per misra, as for Dasam Bani and Sarbloh: ang = ghazal, shabad_id = BaniDB's ShabadID for the
 * ghazal (banidbShabadId), verse_id = line_no = the running misra number. A row's sher is
 * sherPosition(its position in the ghazal).
 */

/** For a ghazal BaniDB lacks (61). Shabad ids in use: SGGS 1-5540, Dasam 7402+, Bhai Gurdas 40001+,
 * Sarbloh 900001-901564; BaniDB's source N sits at 30000-30062 (ghazals) and above. */
export const GHAZAL_SHABAD_BASE = 910000;

/**
 * BaniDB's ShabadID (source N) for each ghazal of this edition. BaniDB numbers its ghazals 30000-30062
 * in its own order: its 30006-30008 are this edition's 9, 7, 8; it lacks ghazal 61; and its 30060 is a
 * second copy of ghazal 63 (30062), so 30060 is left unused.
 */
export function banidbShabadId(ghazal: number): number {
  if (ghazal < 1 || ghazal > 63) throw new Error(`no ghazal ${ghazal}`);
  if (ghazal === 61) return GHAZAL_SHABAD_BASE + 61;
  const moved: Record<number, number> = { 7: 30007, 8: 30008, 9: 30006, 62: 30061, 63: 30062 };
  return moved[ghazal] ?? 29999 + ghazal;
}

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
 * One misra as printed, without the mark that closes it: lines the PDF wrapped are rejoined and spacing
 * is tidied. Nukta letters are precomposed where Unicode has them (ਖ਼ ਗ਼ ਜ਼ ਫ਼ ਲ਼ ਸ਼, as in the BaniDB
 * corpora); the others keep letter + nukta (ਕ਼ qaf, ਅ਼ ain), with a nukta the converter put after the
 * vowel sign (ਕਿ਼) moved back onto its letter.
 */
export function cleanMisra(raw: string): string {
  return composeNukta(raw.replace(new RegExp(`([\u0a3e-\u0a4c])${NUKTA}`, "g"), `${NUKTA}$1`))
    .replace(/-\s*\n\s*/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/** A stored line without the edition's punctuation, for lib/tokenizer: keeps ਕਿ:, hyphens and dandas. */
export function wordText(line: string): string {
  return line
    .replace(/--/g, " ")
    .replace(/[,'"?!.()]/g, " ")
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
    shabad_id: banidbShabadId(m.ghazal),
    gurmukhi:
      m.misra === 2
        ? `${m.text} ॥${toGurmukhiDigits(m.sher)}॥`
        : /(\?|--)$/.test(m.text)
          ? m.text
          : `${m.text} ।`,
  }));
}

/** Sher and misra of the k-th row (1-based) of a ghazal: every sher is two rows. */
export function sherPosition(k: number): { sher: number; misra: 1 | 2 } {
  return { sher: Math.ceil(k / 2), misra: k % 2 === 1 ? 1 : 2 };
}
