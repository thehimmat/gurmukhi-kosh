// Monier-Williams lookup (P5) via the C-SALT Cologne Digital Sanskrit
// Dictionaries REST API (https://api.c-salt.uni-koeln.de/dicts/mw/restful —
// confirmed against its /spec OpenAPI document). Headwords are indexed in
// SLP1 (an ASCII transliteration scheme), so a Devanagari root extracted from
// Mahan Kosh must be converted first (see transliterate.ts). The API's own
// `sense` field is unpopulated in this dataset, so the readable gloss is
// extracted from the raw TEI-XML `xml` field instead — a pure, testable step
// kept separate from the network call.

const MW_API_BASE = "https://api.c-salt.uni-koeln.de/dicts/mw/restful/entries";

export interface MwEntry {
  id: string;
  xml: string;
}

/** Looks up a Sanskrit headword (SLP1) in Monier-Williams. Null on no match. */
export async function fetchMwEntry(headwordSlp1: string): Promise<MwEntry | null> {
  const url = `${MW_API_BASE}?field=headword_slp1&query=${encodeURIComponent(headwordSlp1)}&query_type=term&size=1`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`MW API error ${res.status} for '${headwordSlp1}'`);
  const data = (await res.json()) as { data?: { entries?: { id: string; xml: string }[] } };
  const entry = data.data?.entries?.[0];
  return entry ? { id: entry.id, xml: entry.xml } : null;
}

/**
 * Extracts a readable gloss from an MW TEI-XML entry: the text of the first
 * top-level <sense> element, tags stripped. MW's own style is dense and
 * abbreviation-heavy (citations, comparison forms) — that's preserved
 * verbatim rather than summarized, consistent with never paraphrasing a
 * cited source. Returns null if the entry has no <sense> element at all.
 */
export function extractGlossFromTei(xml: string): string | null {
  const senseMatch = xml.match(/<sense[^>]*>([\s\S]*?)<\/sense>/);
  if (!senseMatch) return null;

  const text = senseMatch[1]
    .replace(/<note[^>]*>[\s\S]*?<\/note>/g, "") // page refs / internal ids, not gloss content
    .replace(/<[^>]+>/g, " ") // tags → space, so adjacent elements don't fuse
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .replace(/\s+([.,;)])/g, "$1") // no space before closing punctuation
    .replace(/([(])\s+/g, "$1") // no space after opening paren
    .trim();

  return text || null;
}
