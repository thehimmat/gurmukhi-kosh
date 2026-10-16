// The line viewer (/line/[id], #146): one line of Gurbani read in its context,
// the whole shabad around it (or, for Sri Sarbloh Granth, which has no shabad
// ids, the whole ang), with the previous and next shabad a click away.
//
// Reading order within a scripture is verse_id: (ang, line_no) is not unique,
// since one printed line holds several verses (gurmukhi-search#46).

import { supabase } from "./supabase";
import type { LineVishraam } from "./vishraam";
import { narrowerThanShabad, pickPassage } from "./passages";

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

// `i` is a word's index among the line's space-separated tokens, the index
// BaniDB's vishraam marks use.
export type LinePart = { text: string; word?: string; i?: number };

const LETTER = /[ਅ-ਹਾ-ੌੲੳੴ]/;
const PUNCT = /[।॥|~]+/;

/**
 * A line as runs of text, each word marked with the dictionary form to link
 * to. Joining every part's text gives back the line exactly; dandas and verse
 * numbers stay plain text.
 */
export function lineParts(gurmukhi: string): LinePart[] {
  const parts: LinePart[] = [];
  const push = (text: string, word?: string, i?: number) => {
    if (!text) return;
    const last = parts.at(-1);
    if (!word && last && !last.word) last.text += text;
    else parts.push(word ? { text, word, i } : { text });
  };
  let index = -1;
  for (const token of gurmukhi.split(/(\s+)/)) {
    if (!token || /^\s+$/.test(token)) { push(token); continue; }
    index++;
    const m = token.match(/^([।॥|~]*)(.*?)([।॥|~]*[੦-੯]*[।॥|~]*)$/);
    const [lead, core, tail] = m ? [m[1], m[2], m[3]] : ["", token, ""];
    push(lead);
    if (core && LETTER.test(core) && !PUNCT.test(core)) push(core, core, index);
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
  vishraam?: LineVishraam | null;
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

// ─── Picker state, shared by the server view and the client picker ───────────

export const GRID_ID = "viewer-lines";

export type PickerState = { view: ViewId; on: Partial<Record<ViewId, string[]>> };

/** The grid attributes for a state: data-view, and data-on-<code> per shown source. */
export function gridAttributes(state: PickerState): Record<string, string> {
  const attrs: Record<string, string> = { "data-view": state.view };
  for (const code of state.on[state.view] ?? []) attrs[`data-on-${code}`] = "1";
  return attrs;
}

// What the reader changed (#224), remembered per browser: the last view, and
// each source they switched on or off by hand. Untouched sources follow each
// page's default, so a source a later page has (or a new one) still shows.
export type ViewerPrefs = { view?: ViewId; choices: Record<string, boolean> };

/** Stored prefs, keeping only a known view and boolean choices for known sources. */
export function parseViewerPrefs(raw: unknown): ViewerPrefs {
  const prefs: ViewerPrefs = { choices: {} };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return prefs;
  const { view, choices } = raw as { view?: unknown; choices?: unknown };
  if (VIEWS.some((v) => v.id === view)) prefs.view = view as ViewId;
  if (choices && typeof choices === "object" && !Array.isArray(choices)) {
    for (const [code, on] of Object.entries(choices)) {
      if (ORDER.includes(code) && typeof on === "boolean") prefs.choices[code] = on;
    }
  }
  return prefs;
}

/** Prefs with one more hand-made choice. */
export function withChoice(prefs: ViewerPrefs, code: string, on: boolean): ViewerPrefs {
  return { ...prefs, choices: { ...prefs.choices, [code]: on } };
}

/** A page's default state with the reader's choices laid over it. */
export function applyViewerPrefs(initial: PickerState, prefs: ViewerPrefs, present: Set<string>): PickerState {
  const has = (id: ViewId) => VIEWS.find((v) => v.id === id)!.sources.some((s) => present.has(s));
  const on: PickerState["on"] = {};
  for (const v of VIEWS) {
    const dflt = new Set(initial.on[v.id] ?? []);
    on[v.id] = v.sources.filter((s) => present.has(s) && (prefs.choices[s] ?? dflt.has(s)));
  }
  return { view: prefs.view && has(prefs.view) ? prefs.view : initial.view, on };
}

/**
 * The grid's CSS: a source shows when the grid carries data-on-<code>, and a
 * line's "nothing here" note shows while some source is on but none of the
 * shown ones has this line.
 */
export function viewerCss(codes: string[]): string {
  const g = `#${GRID_ID}`;
  return codes.map((c) => {
    const on = `${g}[data-on-${c}="1"]`;
    return `${on} .viewer-res[data-src="${c}"]{display:block}`
      + `${on} .viewer-empty{display:block}`
      + `${on} .viewer-cell:has(> .viewer-res[data-src="${c}"]) > .viewer-empty{display:none}`;
  }).join("");
}

/** A source's label: its name and, shortened, its author. */
export function sourceLabel(src: ResourceSource): string {
  const who = src.author?.replace(/\s*\(.*\)$/, "").replace(/,.*$/, "");
  return who ? `${src.name} · ${who}` : src.name;
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
    if (list.some((x) => x.source_code === r.source_code)) continue;
    list.push(r);
    byLine.set(r.line_id, list);
  }
  for (const list of byLine.values()) list.sort((a, b) => rank(a.source_code) - rank(b.source_code));
  return byLine;
}

// "passage": the unit a line is read in, its shabad or, inside a bani, the
// smaller passage BaniDB marks (#220); "ang": its whole ang.
export type Scope = "passage" | "ang";

/** A bani passage the view shows, for its heading ("Japji Sahib · 1 of 43"). */
export type ContextPassage = { bani_id: number; name_gurmukhi: string; name_english: string | null; ordinal: number; paragraphs: number };

export type LineContext = {
  lineId: number;
  scope: Scope;
  lines: ContextLine[];
  resources: Map<number, Resource[]>;
  // The view sources these lines have, in view order.
  sources: ResourceSource[];
  source: { code: string; name: string } | null;
  shabad: { raag_english: string | null; raag_gurmukhi: string | null; writer_english: string | null } | null;
  // Set when the passage scope shows a bani passage rather than the shabad.
  passage: ContextPassage | null;
  // A line of the previous / next passage (or ang) in the same scripture.
  prevId: number | null;
  nextId: number | null;
};

const LINE_COLUMNS = "id, verse_id, shabad_id, ang, line_no, gurmukhi, translation_en, transliteration_en, source_fk";
// Each line carries its shabad, so an ang view can head each shabad it holds,
// and its vishraam marks (#217) for the Gurmukhi pane.
const GROUP_COLUMNS = `${LINE_COLUMNS}, vishraam, shabads(raag_english, raag_gurmukhi, writer_english)`;

/**
 * A line with the passage around it ("passage": its shabad, or the smaller
 * bani passage holding it; Sri Sarbloh Granth, which has neither, reads by
 * ang) or its whole ang ("ang").
 */
export async function fetchLineContext(id: number, scope: Scope = "passage"): Promise<LineContext | null> {
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

  const linesWhere = () => supabase.from("lines").select(GROUP_COLUMNS).eq("source_fk", l.source_fk);
  const read = async (q: ReturnType<typeof linesWhere>) => {
    const { data, error } = await q.order("verse_id", { ascending: true });
    if (error) throw new Error(`fetchLineContext: ${error.message}`);
    return (data ?? []) as unknown as ContextLine[];
  };

  let lines: ContextLine[];
  let passage: ContextPassage | null = null;
  if (scope === "ang") {
    lines = await read(linesWhere().eq("ang", l.ang));
  } else {
    // The shabad and the bani passages holding the line, together; the
    // passage wins only where it's the smaller unit (Japji's first shabad).
    const [shabadLines, held] = await Promise.all([
      l.shabad_id != null ? read(linesWhere().eq("shabad_id", l.shabad_id)) : Promise.resolve([]),
      supabase.from("passages")
        .select("bani_id, ordinal, first_verse_id, last_verse_id, banis(name_gurmukhi, name_english, paragraphs)")
        .eq("source_fk", l.source_fk).lte("first_verse_id", l.verse_id).gte("last_verse_id", l.verse_id),
    ]);
    type Held = { bani_id: number; ordinal: number; first_verse_id: number; last_verse_id: number;
      banis: { name_gurmukhi: string; name_english: string | null; paragraphs: number } | null };
    const p = pickPassage((held.data ?? []) as unknown as Held[]);
    if (p && narrowerThanShabad(p, shabadLines)) {
      lines = shabadLines.length
        ? shabadLines.filter((x) => x.verse_id >= p.first_verse_id && x.verse_id <= p.last_verse_id)
        : await read(linesWhere().gte("verse_id", p.first_verse_id).lte("verse_id", p.last_verse_id));
      passage = { bani_id: p.bani_id, ordinal: p.ordinal, name_gurmukhi: p.banis?.name_gurmukhi ?? "",
        name_english: p.banis?.name_english ?? null, paragraphs: p.banis?.paragraphs ?? 0 };
    } else {
      lines = shabadLines.length ? shabadLines : await read(linesWhere().eq("ang", l.ang));
    }
  }
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
    passage,
    prevId: (prev.data as { id: number } | null)?.id ?? null,
    nextId: (next.data as { id: number } | null)?.id ?? null,
  };
}

/** The context as plain JSON for /api/line/[id]: resources keyed by line id. */
export function lineContextJson(ctx: LineContext) {
  return { ...ctx, resources: Object.fromEntries([...ctx.resources].map(([id, list]) => [String(id), list])) };
}
