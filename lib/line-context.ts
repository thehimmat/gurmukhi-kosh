// The line viewer (/line/[id], #146): one line of Gurbani read in its context,
// the whole shabad around it (or, for Sri Sarbloh Granth, which has no shabad
// ids, the whole ang), with the previous and next shabad a click away.
//
// Reading order within a scripture is verse_id: (ang, line_no) is not unique,
// since one printed line holds several verses (gurmukhi-search#46).

import { supabase } from "./supabase";

/** The viewer link for a line: its context page, scrolled to and marking it. */
export function lineHref(id: number): string {
  return `/line/${id}#line-${id}`;
}

// Each corpus pages in its own unit (as the word page's occurrence cards).
const PAGE_UNIT: Record<string, string> = {
  bhai_gurdas_banidb_v2: "Vaar",
};

export function placeLabel(sourceCode: string | null | undefined, ang: number): string {
  return `${PAGE_UNIT[sourceCode ?? ""] ?? "Ang"} ${ang}`;
}

export type LinePart = { text: string; word?: string };

const LETTER = /[ਅ-ਹਾ-ੌੲੳੴ]/;
const PUNCT = /[।॥|~]+/;

/**
 * A line as runs of text, each word marked with the dictionary form to link
 * to. Joining every part's text gives back the line exactly; dandas and verse
 * numbers stay plain text.
 */
export function lineParts(gurmukhi: string): LinePart[] {
  const parts: LinePart[] = [];
  const push = (text: string, word?: string) => {
    if (!text) return;
    const last = parts.at(-1);
    if (!word && last && !last.word) last.text += text;
    else parts.push(word ? { text, word } : { text });
  };
  for (const token of gurmukhi.split(/(\s+)/)) {
    if (!token || /^\s+$/.test(token)) { push(token); continue; }
    const m = token.match(/^([।॥|~]*)(.*?)([।॥|~]*[੦-੯]*[।॥|~]*)$/);
    const [lead, core, tail] = m ? [m[1], m[2], m[3]] : ["", token, ""];
    push(lead);
    if (core && LETTER.test(core) && !PUNCT.test(core)) push(core, core);
    else push(core);
    push(tail);
  }
  return parts;
}

// ─── Data ────────────────────────────────────────────────────────────────────

export type ContextLine = {
  id: number;
  verse_id: number;
  shabad_id: number | null;
  ang: number;
  line_no: number;
  gurmukhi: string;
  translation_en: string | null;
  transliteration_en: string | null;
  source_fk: number;
};

export type LineContext = {
  lineId: number;
  lines: ContextLine[];
  source: { code: string; name: string } | null;
  shabad: { raag_english: string | null; raag_gurmukhi: string | null; writer_english: string | null } | null;
  // First line of the previous / next shabad (or ang) in the same scripture.
  prevId: number | null;
  nextId: number | null;
};

const LINE_COLUMNS = "id, verse_id, shabad_id, ang, line_no, gurmukhi, translation_en, transliteration_en, source_fk";

export async function fetchLineContext(id: number): Promise<LineContext | null> {
  const { data: line } = await supabase
    .from("lines")
    .select(`${LINE_COLUMNS}, sources(code, name), shabads(raag_english, raag_gurmukhi, writer_english)`)
    .eq("id", id)
    .maybeSingle();
  if (!line) return null;
  const l = line as unknown as ContextLine & {
    sources: LineContext["source"];
    shabads: LineContext["shabad"];
  };

  // The shabad, in reading order; a line without one is read with its ang.
  let group = supabase.from("lines").select(LINE_COLUMNS).eq("source_fk", l.source_fk);
  group = l.shabad_id != null ? group.eq("shabad_id", l.shabad_id) : group.eq("ang", l.ang).is("shabad_id", null);
  const { data: rows, error } = await group.order("verse_id", { ascending: true });
  if (error) throw new Error(`fetchLineContext: ${error.message}`);
  const lines = (rows ?? []) as ContextLine[];
  const first = lines[0] ?? l;
  const last = lines.at(-1) ?? l;

  // Neighbours along (source_fk, verse_id), the unique index's order.
  const [prev, next] = await Promise.all([
    supabase.from("lines").select("id, shabad_id, ang").eq("source_fk", l.source_fk)
      .lt("verse_id", first.verse_id).order("verse_id", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("lines").select("id").eq("source_fk", l.source_fk)
      .gt("verse_id", last.verse_id).order("verse_id", { ascending: true }).limit(1).maybeSingle(),
  ]);

  return {
    lineId: l.id,
    lines,
    source: l.sources,
    shabad: l.shabads,
    // The previous group opens at its own first line; the line just before
    // this group is its last, and its page shows the whole group anyway.
    prevId: (prev.data as { id: number } | null)?.id ?? null,
    nextId: (next.data as { id: number } | null)?.id ?? null,
  };
}
