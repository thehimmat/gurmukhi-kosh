// Cross-reference a scanned text against BaniDB (corpus-expansion triage).
//
// Given a few Unicode lines read from a scan section, look each one up with
// BaniDB's first-letter search and score the best hit. The result says
// whether the section is already online (and where), and lists every line
// whose reading differs from BaniDB's: those differences are kept as a
// witness for side-by-side study, never folded into the canonical text.
//
// Input is Unicode: legacy-font PDF text is converted before it gets here.

const BANIDB = "https://api.banidb.com/v2";

const NUKTA = "\u0A3C";
const HALANT = "\u0A4D";

// Independent vowels index under their carrier letter in BaniDB.
const VOWEL_CARRIER: Record<string, string> = {
  "ਅ": "ਅ", "ਆ": "ਅ", "ਐ": "ਅ", "ਔ": "ਅ",
  "ੲ": "ੲ", "ਇ": "ੲ", "ਈ": "ੲ", "ਏ": "ੲ",
  "ੳ": "ੳ", "ਉ": "ੳ", "ਊ": "ੳ", "ਓ": "ੳ",
};

// BaniDB matches first-letter queries reliably only in its legacy ASCII
// letter codes; a Unicode nukta letter in the query returns nothing. Nukta
// letters are distinct keys there (ਜ਼ is "z", never "j").
const ASCII: Record<string, string> = {
  "ੳ": "a", "ਅ": "A", "ੲ": "e", "ਸ": "s", "ਹ": "h",
  "ਕ": "k", "ਖ": "K", "ਗ": "g", "ਘ": "G", "ਙ": "|",
  "ਚ": "c", "ਛ": "C", "ਜ": "j", "ਝ": "J", "ਞ": "\\",
  "ਟ": "t", "ਠ": "T", "ਡ": "f", "ਢ": "F", "ਣ": "x",
  "ਤ": "q", "ਥ": "Q", "ਦ": "d", "ਧ": "D", "ਨ": "n",
  "ਪ": "p", "ਫ": "P", "ਬ": "b", "ਭ": "B", "ਮ": "m",
  "ਯ": "X", "ਰ": "r", "ਲ": "l", "ਵ": "v", "ੜ": "V",
  ["ਸ" + NUKTA]: "S", ["ਖ" + NUKTA]: "^", ["ਗ" + NUKTA]: "Z",
  ["ਜ" + NUKTA]: "z", ["ਫ" + NUKTA]: "&", ["ਲ" + NUKTA]: "L",
};

const isLetter = (ch: string) => /[\u0A05-\u0A39\u0A5C\u0A72\u0A73]/.test(ch);

// Gurmukhi letters and vowel signs only: drops spaces, punctuation, dandas,
// digits, nukta and halant (ਸ੍ਤ and ਸਤ are one reading).
function lettersOnly(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[^\u0A01-\u0A65\u0A70-\u0A75]/g, "")
    .replaceAll(NUKTA, "")
    .replaceAll(HALANT, "");
}

function wordInitials(line: string, splitHyphens: boolean): string[] {
  const sep = splitHyphens ? /[\s,;:!?।॥()"'“”‘’.\-]+/ : /[\s,;:!?।॥()"'“”‘’.]+/;
  const out: string[] = [];
  for (const word of line.normalize("NFD").split(sep)) {
    const chars = [...word];
    const i = chars.findIndex(isLetter);
    if (i < 0) continue;
    const first = VOWEL_CARRIER[chars[i]] ?? chars[i];
    out.push(chars[i + 1] === NUKTA ? first + NUKTA : first);
  }
  return out;
}

/** BaniDB-style first-letter key (NFD): one letter per Gurmukhi word, nukta kept. */
export function firstLetters(line: string): string {
  return wordInitials(line, false).join("");
}

/** Encode a Unicode first-letter key in BaniDB's ASCII letter codes. */
export function toBaniDBKey(key: string): string {
  let out = "";
  const chars = [...key.normalize("NFD")];
  for (let i = 0; i < chars.length; i++) {
    const withNukta = chars[i + 1] === NUKTA ? chars[i] + NUKTA : null;
    const code = (withNukta && ASCII[withNukta]) ?? ASCII[chars[i]];
    if (code === undefined) throw new Error(`No BaniDB code for "${chars[i]}" in ${key}`);
    out += code;
    if (withNukta) i++;
  }
  return out;
}

// Shorter first-letter keys match too much of the corpus to mean anything.
const MIN_QUERY = 3;
// Keys at least this long also get leading/trailing windows, because BaniDB
// often breaks a verse at a different point than the scan does.
const WINDOW = 6;
const WINDOWED_FROM = 9;

/**
 * ASCII keys to try for one scan line, most specific first: as read, without
 * nukta (editions disagree on it), with hyphenated compounds split (BaniDB
 * writes ਬਗ਼ੈਰ where the scan has ਬ-ਗ਼ੈਰ, and vice versa), then windows.
 */
export function queryKeys(line: string): string[] {
  const letters = wordInitials(line, false);
  if (letters.length < MIN_QUERY) return [];
  const split = wordInitials(line, true);
  const plain = (ls: string[]) => ls.map((l) => l.replace(NUKTA, ""));
  const keys = [letters, plain(letters), split, plain(split)].map((ls) => toBaniDBKey(ls.join("")));
  if (letters.length >= WINDOWED_FROM) {
    keys.push(toBaniDBKey(letters.slice(0, WINDOW).join("")), toBaniDBKey(letters.slice(-WINDOW).join("")));
  }
  return [...new Set(keys)];
}

// Edit distance from the whole of `a` to its best-matching substring of `b`
// (free leading and trailing gaps in b).
function substringDistance(a: string[], b: string[]): number {
  let prev = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return Math.min(...prev);
}

/**
 * 0..1 similarity of a scan line to a BaniDB line, ignoring spacing,
 * punctuation, nukta and halant. The scan line may sit anywhere inside the
 * BaniDB line, since the two often break verses at different points.
 */
export function lineSimilarity(scan: string, ref: string): number {
  const x = [...lettersOnly(scan)];
  const y = [...lettersOnly(ref)];
  if (x.length === 0 || y.length === 0) return 0;
  return Math.max(0, 1 - substringDistance(x, y) / x.length);
}

export type SectionStatus = "online" | "partial" | "not_found";

// A line counts as found when its best hit is at least this close; below 1
// it is found with a variant reading. Transliterated Persian (Bhai Nand Lal)
// differs a lot between editions in vowels alone (ਤੋ/ਤੂ, ਨਮੇ/ਨਮੀ).
const LINE_MATCH = 0.7;
// Share of sampled lines that must be found for the section to be "online".
const SECTION_ONLINE = 0.8;
export function classifySection(similarities: number[]): SectionStatus {
  if (similarities.length === 0) return "not_found";
  const found = similarities.filter((s) => s >= LINE_MATCH).length;
  if (found / similarities.length >= SECTION_ONLINE) return "online";
  return found > 0 ? "partial" : "not_found";
}

export interface BaniDBVerse {
  unicode: string;
  sourceId: string;
  shabadId: number;
  verseId: number;
  pageNo: number | null;
}

type Fetch = (url: string) => Promise<Response>;
interface Opts {
  fetch?: Fetch;
}

interface RawVerse {
  verseId: number;
  shabadId: number;
  pageNo: number | null;
  verse: { unicode: string };
  source?: { sourceId: string };
}

/** First-letter-anywhere search across every BaniDB source. */
export async function searchBaniDB(query: string, opts: Opts = {}): Promise<BaniDBVerse[]> {
  const doFetch = opts.fetch ?? fetch;
  const url = `${BANIDB}/search/${encodeURIComponent(query)}?source=all&searchtype=1&results=10`;
  const res = await doFetch(url);
  if (!res.ok) throw new Error(`BaniDB search failed (${res.status}) for ${query}`);
  const body = (await res.json()) as { verses?: RawVerse[] };
  return (body.verses ?? []).map((v) => ({
    unicode: v.verse.unicode,
    sourceId: v.source?.sourceId ?? "",
    shabadId: v.shabadId,
    verseId: v.verseId,
    pageNo: v.pageNo ?? null,
  }));
}

export interface LineResult {
  scan: string;
  best: BaniDBVerse | null;
  similarity: number;
}

export interface Variant {
  scan: string;
  banidb: string;
  verseId: number;
  similarity: number;
}

export interface SectionResult {
  status: SectionStatus;
  sourceId: string | null;
  shabadIds: number[];
  lines: LineResult[];
  variants: Variant[];
}

export async function crossReferenceSection(lines: string[], opts: Opts = {}): Promise<SectionResult> {
  const results: LineResult[] = [];
  for (const scan of lines) {
    const keys = queryKeys(scan);
    if (keys.length === 0) continue;
    let best: BaniDBVerse | null = null;
    let similarity = 0;
    for (const key of keys) {
      for (const h of await searchBaniDB(key, opts)) {
        const s = lineSimilarity(scan, h.unicode);
        if (s > similarity) [best, similarity] = [h, s];
      }
      if (similarity >= LINE_MATCH) break;
    }
    results.push({ scan, best, similarity });
  }

  const found = results.filter((r) => r.best && r.similarity >= LINE_MATCH);
  const sourceCounts = new Map<string, number>();
  for (const r of found) sourceCounts.set(r.best!.sourceId, (sourceCounts.get(r.best!.sourceId) ?? 0) + 1);
  const sourceId = [...sourceCounts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  return {
    status: classifySection(results.map((r) => r.similarity)),
    sourceId,
    shabadIds: [...new Set(found.map((r) => r.best!.shabadId))].sort((a, b) => a - b),
    lines: results,
    variants: found
      .filter((r) => r.similarity < 1)
      .map((r) => ({ scan: r.scan, banidb: r.best!.unicode, verseId: r.best!.verseId, similarity: r.similarity })),
  };
}
