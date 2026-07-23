// SikhRI "The Guru Granth Sahib Dictionary" (gurugranthsahibdictionary.io) —
// pure HTML parsers, kept separate from the network scraper so they stay
// unit-testable against captured real fixtures (mirrors pipeline/etymology/dsal.ts).
//
// Two shapes are parsed:
//   1. Glossary-by-letter pages of either edition, which list every entry with
//      its headword term and a shared `wn` id. The Panjabi edition's term is
//      the Gurmukhi headword (our join key to `words`); the English edition's
//      term is SikhRI's romanization (needed to fetch the English detail page).
//      Joining the two editions on `wn` yields (gurmukhi, roman) per entry.
//   2. The English entry detail page (/dictionary/english/ms/<roman>?wn=…),
//      which carries the meaning, a labelled Grammar line, and an Etymology.
//
// Licensing: SikhRI's dictionary is a modern copyrighted work ("© SikhRI, All
// Rights Reserved"). Used here per the user's proceed-and-acknowledge decision
// (2026-07-16): free, strictly non-commercial, prominently attributed, and
// takedown-proof — every row is scoped to dict_source 'sikhri' so a single
// scoped delete removes it on request.

export interface CatalogEntry {
  term: string; // headword in the page's edition: Gurmukhi (panjabi) or roman (english)
  wn: string; // base64 id token exactly as it appears in the URL (e.g. "Mjk4Mw==")
}

/**
 * Extracts (term, wn) pairs from a glossary-letter page of either edition. The
 * headword sits in the anchor's href path segment
 * (/dictionary/{panjabi|english}/ms/<term>?wn=<token>), the reliable place to
 * read it (visible text is HTML-entity encoded). Deduplicated on (term, wn) —
 * a headword appears once per homograph wn.
 */
export function parseGlossaryCatalog(html: string): CatalogEntry[] {
  const seen = new Set<string>();
  const out: CatalogEntry[] = [];
  const re = /href="\/dictionary\/(?:panjabi|english)\/ms\/([^"?]+)\?wn=([A-Za-z0-9+/=]+)/g;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    let term: string;
    try {
      term = decodeURIComponent(m[1]);
    } catch {
      term = m[1];
    }
    term = term.trim();
    const wn = m[2];
    if (!term) continue;
    const key = `${term} ${wn}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ term, wn });
  }
  return out;
}

export interface SikhriEntry {
  headwordRoman: string | null; // dictionary's own romanization (e.g. "kaliāṇā")
  meaning: string | null;
  grammar: string | null; // raw grammar line, e.g. "noun, nominative case; masculine, plural."
  etymology: string | null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x([0-9A-Fa-f]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)));
}

function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .replace(/\s+([.,;:)])/g, "$1")
    .trim();
}

/** Text of a <p> block after its leading `dictHeading` label, tags stripped. */
function valueAfterLabel(block: string): string {
  const afterLabel = block.replace(/^[\s\S]*?<\/i>/, "");
  return stripTags(afterLabel).replace(/[.;:,\s]+$/, "");
}

function headingLabel(block: string): "grammar" | "etymology" | null {
  const label = block.match(/class="dictHeading"[^>]*>\s*([^<:]+)\s*:?\s*<\/i>/);
  if (!label) return null;
  const t = label[1].trim().toLowerCase();
  if (t.startsWith("grammar")) return "grammar";
  if (t.startsWith("etymolog")) return "etymology";
  return null;
}

/**
 * Parses an English entry detail page. The meaning is the first bare <p>
 * (no dictHeading label), which always precedes the Grammar/Etymology labels
 * and the instance/footer chrome; Grammar and Etymology are read from their
 * labelled <p> blocks. Any of the three may be null. Text is preserved
 * verbatim, never paraphrased.
 */
export function parseEntry(html: string): SikhriEntry {
  const headMatch = html.match(/<h5[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/);
  const headwordRoman = headMatch ? stripTags(headMatch[1]) || null : null;

  const blocks = [...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g)].map((m) => m[1]);

  let meaning: string | null = null;
  let grammar: string | null = null;
  let etymology: string | null = null;

  for (const block of blocks) {
    const label = headingLabel(block);
    if (label === "grammar") grammar = valueAfterLabel(block) || null;
    else if (label === "etymology") etymology = valueAfterLabel(block) || null;
    else if (meaning === null) {
      const text = stripTags(block);
      if (text) meaning = text;
    }
  }

  return { headwordRoman, meaning, grammar, etymology };
}

/** Decodes a `wn` base64 token to its numeric id string (e.g. "Mjk4Mw==" → "2983"). */
export function decodeWn(wn: string): string {
  return Buffer.from(wn, "base64").toString("utf8");
}
