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
  shabads?: { raag_english: string | null; raag_gurmukhi: string | null; writer_english: string | null } | null;
};

// ─── Resources (the right-hand pane) ────────────────────────────────────────

// The viewer is a split view (#146): Gurbani on the left, and on the right one
// of several views, each a set of per-line sources the reader switches on or
// off. Sources come from line_translations, plus BaniDB's own English, which
// is lines.translation_en (BaniDB's `bdb`, a revision of Dr Sant Singh
// Khalsa's translation that differs on ~13% of lines).
export const BANIDB_EN = "banidb_en";

export type ViewId = "translation" | "commentary";
export const VIEWS: Array<{ id: ViewId; label: string; sources: string[] }> = [
  { id: "translation", label: "Translation", sources: ["ssk_en", BANIDB_EN, "manmohan_en"] },
  { id: "commentary", label: "Punjabi commentary", sources: ["ss_darpan", "faridkot", "manmohan_pa"] },
];
const ORDER = VIEWS.flatMap((v) => v.sources);

/**
 * The sources a view starts with: every one it has, except that BaniDB's
 * English is only a stand-in for Dr Sant Singh Khalsa's, so it starts off
 * when his is present.
 */
export function defaultSources(view: ViewId, present: Set<string>): string[] {
  const own = VIEWS.find((v) => v.id === view)!.sources.filter((s) => present.has(s));
  return present.has("ssk_en") ? own.filter((s) => s !== BANIDB_EN) : own;
}

export type Resource = {
  line_id: number;
  source_code: string;
  language: string;
  body_unicode: string;
  caveat: string | null;
};

export type ResourceSource = { code: string; name: string; author: string | null };

const rank = (code: string) => {
  const i = ORDER.indexOf(code);
  return i === -1 ? ORDER.length : i;
};

/** Each line's resources, in view order (unknown sources last). */
export function resourcesByLine(rows: Resource[]): Map<number, Resource[]> {
  const byLine = new Map<number, Resource[]>();
  for (const r of rows) {
    const list = byLine.get(r.line_id) ?? [];
    list.push(r);
    byLine.set(r.line_id, list);
  }
  for (const list of byLine.values()) list.sort((a, b) => rank(a.source_code) - rank(b.source_code));
  return byLine;
}

export type Scope = "shabad" | "ang";

export type LineContext = {
  lineId: number;
  scope: Scope;
  lines: ContextLine[];
  resources: Map<number, Resource[]>;
  // The view sources these lines have, in view order.
  sources: ResourceSource[];
  source: { code: string; name: string } | null;
  shabad: { raag_english: string | null; raag_gurmukhi: string | null; writer_english: string | null } | null;
  // A line of the previous / next shabad (or ang) in the same scripture.
  prevId: number | null;
  nextId: number | null;
};

const LINE_COLUMNS = "id, verse_id, shabad_id, ang, line_no, gurmukhi, translation_en, transliteration_en, source_fk";
// Each line carries its shabad, so an ang view can head each shabad it holds.
const GROUP_COLUMNS = `${LINE_COLUMNS}, shabads(raag_english, raag_gurmukhi, writer_english)`;

/**
 * A line with the passage around it: its shabad (scope "shabad"; Sri Sarbloh
 * Granth, which has no shabad ids, reads by ang) or its whole ang ("ang").
 */
export async function fetchLineContext(id: number, scope: Scope = "shabad"): Promise<LineContext | null> {
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

  let group = supabase.from("lines").select(GROUP_COLUMNS).eq("source_fk", l.source_fk);
  group = scope === "shabad" && l.shabad_id != null
    ? group.eq("shabad_id", l.shabad_id)
    : group.eq("ang", l.ang);
  const { data: rows, error } = await group.order("verse_id", { ascending: true });
  if (error) throw new Error(`fetchLineContext: ${error.message}`);
  const lines = (rows ?? []) as unknown as ContextLine[];
  const first = lines[0] ?? l;
  const last = lines.at(-1) ?? l;

  // Neighbours along (source_fk, verse_id), the unique index's order, and
  // the passage's resources, all at once.
  const ids = lines.map((x) => x.id);
  const [prev, next, res, sources] = await Promise.all([
    supabase.from("lines").select("id").eq("source_fk", l.source_fk)
      .lt("verse_id", first.verse_id).order("verse_id", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("lines").select("id").eq("source_fk", l.source_fk)
      .gt("verse_id", last.verse_id).order("verse_id", { ascending: true }).limit(1).maybeSingle(),
    ids.length
      ? supabase.from("line_translations").select("line_id, source_code, language, body_unicode, caveat")
          .in("line_id", ids).in("source_code", ORDER)
      : Promise.resolve({ data: [], error: null }),
    supabase.from("translation_sources").select("code, name, author"),
  ]);
  if (res.error) throw new Error(`fetchLineContext: ${res.error.message}`);

  const rowsOut = (res.data ?? []) as Resource[];
  for (const x of lines) {
    if (x.translation_en) {
      rowsOut.push({ line_id: x.id, source_code: BANIDB_EN, language: "en", body_unicode: x.translation_en, caveat: null });
    }
  }
  const resources = resourcesByLine(rowsOut);
  const present = new Set(rowsOut.map((r) => r.source_code));
  const named = [
    ...((sources.data ?? []) as ResourceSource[]),
    { code: BANIDB_EN, name: "BaniDB English", author: "BaniDB (Khalis Foundation), revised from Dr Sant Singh Khalsa" },
  ];

  return {
    lineId: l.id,
    scope,
    lines,
    resources,
    sources: named.filter((src) => present.has(src.code)).sort((a, b) => rank(a.code) - rank(b.code)),
    source: l.sources,
    shabad: l.shabads,
    prevId: (prev.data as { id: number } | null)?.id ?? null,
    nextId: (next.data as { id: number } | null)?.id ?? null,
  };
}
