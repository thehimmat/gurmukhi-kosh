// Load a scope's rows for the pad-arth draft (#23) and turn them into draftLine() inputs.
//
// A scope is an ang of one source, a shabad, or a passage (a bani's paragraph, migration 059:
// for Japji, one pauri). The pad-arth and Shackle are curator-only (069), so call this with the
// service-role client; the anon client gets a draft without them.
//
// buildDraftInputs() is pure and holds the mapping; fetchDraft() only runs the queries.

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows } from "../fetch-all-rows";
import { draftLine, type DraftCollocation, type GlossMatch, type DraftInput, type DraftLine, type DraftVariant } from "./draft";
import { parseMkPointer } from "./mk-pointer";
import { foldGurmukhi, foldSpelling } from "../gurmukhi-fold";

export type DraftScope =
  | { kind: "ang"; sourceCode: string; ang: number }
  | { kind: "shabad"; shabadId: number }
  | { kind: "passage"; passageId: number }
  /** Paragraph `ordinal` of a bani: every part of it (passages, migration 059). */
  | { kind: "paragraph"; baniId: number; ordinal: number };

export type LineRow = { id: number; verse_id: number; gurmukhi: string };
type OccurrenceRow = { id: number; line_id: number; position: number; word_id: number; words: { gurmukhi: string } | null };
type DefinitionRow = {
  id: number;
  word_id: number;
  sense_number: number | null;
  definition_text: string;
  definition_en: string | null;
  notes: string | null;
  dict_sources: { code: string } | null;
};
type CollocationRow = {
  id: number;
  phrase_gurmukhi: string;
  members: string[][];
  gloss: string;
  pos_raw: string | null;
  origin: "compound" | "usage";
  dict_sources: { code: string } | null;
};
type FormLinkRow = {
  word_id: number;
  lexeme_id: number;
  source_code: string | null;
  label_raw: string | null;
  features: Record<string, unknown> | null;
  lexemes: { root_word_id: number | null } | null;
};
type PadarthRow = {
  id: number;
  line_id: number;
  ordinal: number;
  term: string;
  gloss: string;
  notes: string[];
  is_phrase: boolean;
  padarth_gloss_occurrences: { word_occurrence_id: number; match: GlossMatch; lexeme_id: number | null }[];
  padarth_case_evidence: { gram_case: string; marker: string; basis: string }[];
};
type GrammarRow = {
  id: number;
  word_id: number;
  source_code: string | null;
  provenance: string;
  source_line_id: number | null;
  pos: string | null;
  gender: string | null;
  number: string | null;
  gram_case: string | null;
  person: string | null;
  verb_form: string | null;
};

export type DraftRows = {
  lines: LineRow[];
  occurrences: OccurrenceRow[];
  definitions: DefinitionRow[];
  formLinks: FormLinkRow[];
  /** The headword words the form links point at. */
  headwords: { id: number; gurmukhi: string }[];
  /** The words Mahan Kosh "ਦੇਖੋ" rows on the scope's words name (definitions holds their senses). */
  pointerTargets: { id: number; gurmukhi: string }[];
  /** Words sharing a fold key with a line word that has no dictionary row (definitions holds their senses). */
  variantWords: { id: number; gurmukhi: string }[];
  /** Every dictionary phrase (087), or none before it is applied. */
  collocations: CollocationRow[];
  padarth: PadarthRow[];
  grammar: GrammarRow[];
};

export function buildDraftInputs(rows: DraftRows): DraftInput[] {
  const headword = new Map(rows.headwords.map((w) => [w.id, w.gurmukhi]));
  const positionOf = new Map(rows.occurrences.map((o) => [o.id, { lineId: o.line_id, position: o.position }]));

  const formLinks = rows.formLinks.flatMap((f) => {
    const root = f.lexemes?.root_word_id ?? null;
    if (root === null || root === f.word_id || f.features?.headword === true || !f.source_code) return [];
    const definitionId = f.features?.definition_id;
    return [
      {
        wordId: f.word_id,
        lexemeId: f.lexeme_id,
        headwordWordId: root,
        headword: headword.get(root) ?? "",
        sourceCode: f.source_code,
        labelRaw: f.label_raw,
        definitionId: typeof definitionId === "number" ? definitionId : null,
      },
    ];
  });
  const targetId = new Map(rows.pointerTargets.map((w) => [w.gurmukhi, w.id]));
  /** word id → the corpus words its Mahan Kosh pointer rows name. */
  const pointsAt = new Map<number, { target: string; wordId: number }[]>();
  for (const d of rows.definitions) {
    if (d.dict_sources?.code !== "mahan_kosh") continue;
    for (const p of parseMkPointer(d.definition_text) ?? []) {
      const wordId = targetId.get(p.target);
      if (wordId === undefined) continue;
      const list = pointsAt.get(d.word_id) ?? [];
      if (!list.some((t) => t.target === p.target)) list.push({ target: p.target, wordId });
      pointsAt.set(d.word_id, list);
    }
  }
  // Spelling variants (#377), for words with no dictionary row and no Shackle form link.
  const hasRows = new Set([...rows.definitions.map((d) => d.word_id), ...formLinks.map((f) => f.wordId)]);
  const byFold = new Map<string, { id: number; gurmukhi: string }[]>();
  for (const w of rows.variantWords) {
    const key = foldGurmukhi(w.gurmukhi);
    if (key) byFold.set(key, [...(byFold.get(key) ?? []), w]);
  }
  const variantsOf = (wordId: number, gurmukhi: string): DraftVariant[] => {
    if (hasRows.has(wordId)) return [];
    const key = foldGurmukhi(gurmukhi);
    return (byFold.get(key) ?? [])
      .filter((w) => w.id !== wordId)
      .map((w) => ({ wordId, variantWordId: w.id, variant: w.gurmukhi, tier: foldSpelling(w.gurmukhi) === foldSpelling(gurmukhi) ? "spelling" : "ending" }));
  };
  // One list for every line, so the draft's phrase index is built once (draft.ts).
  const collocations: DraftCollocation[] = rows.collocations.map((c) => ({
    id: c.id,
    sourceCode: c.dict_sources?.code ?? "",
    phrase: c.phrase_gurmukhi,
    members: c.members,
    gloss: c.gloss,
    posRaw: c.pos_raw,
    origin: c.origin,
  }));
  const definitions = rows.definitions.map((d) => ({
    id: d.id,
    wordId: d.word_id,
    sourceCode: d.dict_sources?.code ?? "",
    senseNumber: d.sense_number,
    text: d.definition_text,
    textEn: d.definition_en,
    notes: d.notes,
  }));
  const grammar = rows.grammar.map((g) => ({
    id: g.id,
    wordId: g.word_id,
    sourceCode: g.source_code,
    provenance: g.provenance,
    sourceLineId: g.source_line_id,
    pos: g.pos,
    gender: g.gender,
    number: g.number,
    gramCase: g.gram_case,
    person: g.person,
    verbForm: g.verb_form,
  }));

  return [...rows.lines]
    .sort((a, b) => a.verse_id - b.verse_id)
    .map((line) => {
      const tokens = rows.occurrences
        .filter((o) => o.line_id === line.id)
        .sort((a, b) => a.position - b.position)
        .map((o) => ({ position: o.position, wordId: o.word_id, gurmukhi: o.words?.gurmukhi ?? "" }));
      const wordIds = new Set(tokens.map((t) => t.wordId));
      const links = formLinks.filter((f) => wordIds.has(f.wordId));
      const mkPointerTargets = [...wordIds].flatMap((w) => pointsAt.get(w) ?? []);
      const variants = [...new Map(tokens.map((t) => [t.wordId, t.gurmukhi])).entries()].flatMap(([id, g]) => variantsOf(id, g));
      const defWords = new Set([
        ...wordIds,
        ...links.map((f) => f.headwordWordId),
        ...mkPointerTargets.map((t) => t.wordId),
        ...variants.map((v) => v.variantWordId),
      ]);
      const padarth = rows.padarth
        .filter((g) => g.line_id === line.id)
        .map((g) => ({
          id: g.id,
          ordinal: g.ordinal,
          term: g.term,
          gloss: g.gloss,
          notes: g.notes,
          isPhrase: g.is_phrase,
          links: g.padarth_gloss_occurrences
            .flatMap((l) => {
              const at = positionOf.get(l.word_occurrence_id);
              return at && at.lineId === line.id ? [{ position: at.position, match: l.match, lexemeId: l.lexeme_id }] : [];
            })
            .sort((a, b) => a.position - b.position),
          caseEvidence: g.padarth_case_evidence.map((c) => ({
            gramCase: c.gram_case as DraftInput["padarth"][number]["caseEvidence"][number]["gramCase"],
            marker: c.marker,
            basis: c.basis,
          })),
        }));
      return {
        lineId: line.id,
        tokens,
        definitions: definitions.filter((d) => defWords.has(d.wordId)),
        formLinks: links,
        padarth,
        grammar: grammar.filter((g) => wordIds.has(g.wordId)),
        mkPointerTargets,
        variants,
        collocations,
      };
    });
}

// ── Queries ────────────────────────────────────────────────────────────────────────────────

const CHUNK = 200;
const chunks = <T>(xs: T[]) => Array.from({ length: Math.ceil(xs.length / CHUNK) }, (_, i) => xs.slice(i * CHUNK, (i + 1) * CHUNK));

type RangeQuery = ReturnType<Parameters<typeof fetchAllRows>[1]>;

/** Every row of `query` over ids, in chunks short enough for a URL, each paged past the row cap. */
async function inChunks<T>(label: string, ids: number[], query: (ids: number[]) => RangeQuery): Promise<T[]> {
  const out: T[] = [];
  for (const part of chunks([...new Set(ids)])) out.push(...(await fetchAllRows<T>(label, () => query(part))));
  return out;
}

const LINE_COLUMNS = "id, verse_id, gurmukhi";

async function must<T>(label: string, q: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await q;
  if (error || data === null) throw new Error(`${label}: ${error?.message ?? "no row"}`);
  return data;
}

export async function fetchScopeLines(db: SupabaseClient, scope: DraftScope): Promise<LineRow[]> {
  if (scope.kind === "shabad") {
    return fetchAllRows<LineRow>("lines", () => db.from("lines").select(LINE_COLUMNS).eq("shabad_id", scope.shabadId).order("verse_id"));
  }
  if (scope.kind === "ang") {
    const source = await must<{ id: number }>("source", db.from("sources").select("id").eq("code", scope.sourceCode).single());
    return fetchAllRows<LineRow>("lines", () =>
      db.from("lines").select(LINE_COLUMNS).eq("source_fk", source.id).eq("ang", scope.ang).order("verse_id")
    );
  }
  type Span = { source_fk: number; first_verse_id: number; last_verse_id: number };
  const spans =
    scope.kind === "passage"
      ? [await must<Span>("passage", db.from("passages").select("source_fk, first_verse_id, last_verse_id").eq("id", scope.passageId).single())]
      : await must<Span[]>(
          "passages",
          db
            .from("passages")
            .select("source_fk, first_verse_id, last_verse_id")
            .eq("bani_id", scope.baniId)
            .eq("ordinal", scope.ordinal)
            .order("part")
        );
  const out: LineRow[] = [];
  for (const p of spans) {
    out.push(
      ...(await fetchAllRows<LineRow>("lines", () =>
        db
          .from("lines")
          .select(LINE_COLUMNS)
          .eq("source_fk", p.source_fk)
          .gte("verse_id", p.first_verse_id)
          .lte("verse_id", p.last_verse_id)
          .order("verse_id")
      ))
    );
  }
  return out;
}

export async function fetchDraftRows(db: SupabaseClient, lines: LineRow[]): Promise<DraftRows> {
  const lineIds = lines.map((l) => l.id);
  const [occurrences, padarth] = await Promise.all([
    inChunks<OccurrenceRow>("word_occurrences", lineIds, (ids) =>
      db.from("word_occurrences").select("id, line_id, position, word_id, words(gurmukhi)").in("line_id", ids).order("id")
    ),
    inChunks<PadarthRow>("padarth_glosses", lineIds, (ids) =>
      db
        .from("padarth_glosses")
        .select(
          "id, line_id, ordinal, term, gloss, notes, is_phrase," +
            " padarth_gloss_occurrences(word_occurrence_id, match, lexeme_id)," +
            " padarth_case_evidence(gram_case, marker, basis)"
        )
        .in("line_id", ids)
        .eq("source_code", "ss_padarth")
        .eq("kind", "entry")
        .order("id")
    ),
  ]);
  const wordIds = occurrences.map((o) => o.word_id);
  const [formLinks, grammar] = await Promise.all([
    inChunks<FormLinkRow>("word_forms", wordIds, (ids) =>
      db
        .from("word_forms")
        .select("word_id, lexeme_id, source_code, label_raw, features, lexemes(root_word_id)")
        .in("word_id", ids)
        .eq("source_code", "shackle")
        .order("id")
    ),
    inChunks<GrammarRow>("word_grammar", wordIds, (ids) =>
      db
        .from("word_grammar")
        .select("id, word_id, source_code, provenance, source_line_id, pos, gender, number, gram_case, person, verb_form")
        .in("word_id", ids)
        .order("id")
    ),
  ]);
  const headwordIds = formLinks.flatMap((f) => (f.lexemes?.root_word_id ? [f.lexemes.root_word_id] : []));
  const [definitions, headwords] = await Promise.all([
    inChunks<DefinitionRow>("definitions", [...wordIds, ...headwordIds], (ids) =>
      db
        .from("definitions")
        .select("id, word_id, sense_number, definition_text, definition_en, notes, dict_sources(code)")
        .in("word_id", ids)
        .order("id")
    ),
    inChunks<{ id: number; gurmukhi: string }>("words", headwordIds, (ids) =>
      db.from("words").select("id, gurmukhi").in("id", ids).order("id")
    ),
  ]);
  // One hop through Mahan Kosh "ਦੇਖੋ" rows: the words they name, and those words' Mahan Kosh senses.
  const targets = [
    ...new Set(
      definitions.flatMap((d) => (d.dict_sources?.code === "mahan_kosh" ? (parseMkPointer(d.definition_text) ?? []).map((p) => p.target) : []))
    ),
  ];
  const pointerTargets = targets.length
    ? (
        await Promise.all(
          chunks(targets).map((part) =>
            fetchAllRows<{ id: number; gurmukhi: string }>("words", () => db.from("words").select("id, gurmukhi").in("gurmukhi", part).order("id"))
          )
        )
      ).flat()
    : [];
  const known = new Set(definitions.map((d) => d.word_id));
  const targetDefinitions = await inChunks<DefinitionRow>(
    "definitions",
    pointerTargets.map((w) => w.id).filter((id) => !known.has(id)),
    (ids) =>
      db
        .from("definitions")
        .select("id, word_id, sense_number, definition_text, definition_en, notes, dict_sources!inner(code)")
        .in("word_id", ids)
        .eq("dict_sources.code", "mahan_kosh")
        .order("id")
  );
  // Spelling variants (#377) of the words with no dictionary row and no form link, by fold key.
  const covered = new Set([...definitions.map((d) => d.word_id), ...formLinks.map((f) => f.word_id)]);
  const keys = [
    ...new Set(occurrences.filter((o) => !covered.has(o.word_id)).map((o) => foldGurmukhi(o.words?.gurmukhi ?? "")).filter(Boolean)),
  ];
  const variantWords = (
    await Promise.all(
      chunks(keys).map((part) =>
        fetchAllRows<{ id: number; gurmukhi: string }>("words", () => db.from("words").select("id, gurmukhi").in("search_fold", part).order("id"))
      )
    )
  ).flat();
  const loaded = new Set([...definitions, ...targetDefinitions].map((d) => d.word_id));
  const variantDefinitions = await inChunks<DefinitionRow>(
    "definitions",
    variantWords.map((w) => w.id).filter((id) => !loaded.has(id)),
    (ids) => db.from("definitions").select("id, word_id, sense_number, definition_text, definition_en, notes, dict_sources(code)").in("word_id", ids).order("id")
  );
  const collocations = await fetchCollocations(db);
  return {
    lines,
    occurrences,
    definitions: [...definitions, ...targetDefinitions, ...variantDefinitions],
    formLinks,
    headwords,
    pointerTargets,
    variantWords,
    collocations,
    padarth,
    grammar,
  };
}

/**
 * Every dictionary phrase (087). Curator-only: the anon client gets none. Before 087 is applied
 * the table is missing and the draft simply has no dictionary phrases.
 */
async function fetchCollocations(db: SupabaseClient): Promise<CollocationRow[]> {
  try {
    return await fetchAllRows<CollocationRow>("dict_collocations", () =>
      db.from("dict_collocations").select("id, phrase_gurmukhi, members, gloss, pos_raw, origin, dict_sources(code)").order("id")
    );
  } catch (e) {
    if (/does not exist|could not find|permission denied/i.test(String((e as Error).message))) return [];
    throw e;
  }
}

/** The draft for every line of a scope, in reading order. */
export async function fetchDraft(db: SupabaseClient, scope: DraftScope): Promise<{ lines: LineRow[]; drafts: DraftLine[] }> {
  const lines = await fetchScopeLines(db, scope);
  if (lines.length === 0) return { lines, drafts: [] };
  const rows = await fetchDraftRows(db, lines);
  const byId = new Map(lines.map((l) => [l.id, l]));
  const drafts = buildDraftInputs(rows).map(draftLine);
  return { lines: drafts.map((d) => byId.get(d.lineId)!), drafts };
}
