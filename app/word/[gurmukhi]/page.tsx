import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { Metadata } from "next";
import type { DefinitionWithSource, DictExample, Etymology, WordGrammarWithRule } from "@/lib/supabase";
import { buildGrammarView, type AttributeView, type AttributeReading } from "@/lib/grammar-view";
import { ProvenanceBadge } from "@/components/word/ProvenanceBadge";
import { TabNav } from "@/components/word/TabNav";
import { FlagForm } from "@/components/word/FlagForm";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ gurmukhi: string }>;
  searchParams: Promise<{ tab?: string; page?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { gurmukhi } = await params;
  const word = decodeURIComponent(gurmukhi);
  return {
    title: `${word} — Gurmukhi Kosh`,
    description: `Dictionary entry for the Gurmukhi word ${word} as found in Sri Guru Granth Sahib Ji.`,
  };
}

// ─── Shared style helpers ────────────────────────────────────────────────────

const SECTION_HEADING: React.CSSProperties = {
  fontSize: "0.875rem",
  fontFamily: '"Inter", sans-serif',
  fontWeight: 600,
  letterSpacing: "0.07em",
  textTransform: "uppercase",
  color: "var(--text-secondary)",
  marginBottom: "0.85rem",
};

const CARD: React.CSSProperties = {
  background: "var(--card-bg, #fff)",
  border: "1px solid var(--border)",
  borderRadius: "8px",
  padding: "1rem 1.25rem",
  marginBottom: "0.75rem",
};

// ─── Sub-components ──────────────────────────────────────────────────────────

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={SECTION_HEADING}>{children}</h2>
  );
}

function CrossRefTags({ refs }: { refs: Record<string, string> | null }) {
  if (!refs || Object.keys(refs).length === 0) return null;
  const display: Record<string, string> = {
    ar_fa: "Arabic / Farsi",
    sa:    "Sanskrit",
    hi:    "Hindi",
    fa:    "Farsi",
    ar:    "Arabic",
    ur:    "Urdu",
    pa:    "Punjabi",
  };
  return (
    <span style={{ display: "inline-flex", gap: "0.35rem", flexWrap: "wrap", marginLeft: "0.4rem" }}>
      {Object.entries(refs).map(([key, val]) =>
        key !== "origin_lang" ? (
          <span
            key={key}
            title={display[key] ?? key}
            style={{
              background: "var(--accent-bg, #f5ede6)",
              color: "var(--accent)",
              borderRadius: "4px",
              padding: "0 5px",
              fontSize: "0.8rem",
              fontFamily: '"Inter", sans-serif',
              direction: "rtl",
            }}
          >
            {val}
          </span>
        ) : null
      )}
    </span>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ color: "var(--text-secondary)", fontStyle: "italic", fontFamily: '"Inter", sans-serif', fontSize: "0.95rem", padding: "1rem 0" }}>
      {children}
    </p>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default async function WordPage({ params, searchParams }: Props) {
  const { gurmukhi: encoded } = await params;
  const { tab = "overview", page: pageParam } = await searchParams;
  const OCC_PAGE_SIZE = 50;
  const occPage = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);
  const word = decodeURIComponent(encoded);

  // Step 1: fetch word + grammar together
  const { data: wordRow } = await supabase
    .from("words")
    .select("id, gurmukhi, frequency, ipa_display, roman_iso15919, roman_practical, in_corpus, spelling_status, spelling_reviewed_at, word_grammar(*, grammar_rules(*))")
    .eq("gurmukhi", word)
    .single();

  if (!wordRow) notFound();

  const wordId = wordRow.id;
  const inCorpus = (wordRow as unknown as { in_corpus: boolean | null }).in_corpus ?? true;
  // A human-reviewed spelling is no longer "unverified", even if its origin
  // marker (spelling_status) still records how it first entered.
  const spellingReviewed = !!(wordRow as unknown as { spelling_reviewed_at: string | null }).spelling_reviewed_at;
  const spellingStatus = spellingReviewed ? null : (wordRow as unknown as { spelling_status: string | null }).spelling_status;
  const ipaDisplay = (wordRow as unknown as { ipa_display: string | null }).ipa_display;
  const romanIso = (wordRow as unknown as { roman_iso15919: string | null }).roman_iso15919;
  const romanPractical = (wordRow as unknown as { roman_practical: string | null }).roman_practical;
  const grammar = ((wordRow as unknown as { word_grammar: WordGrammarWithRule[] }).word_grammar ?? []);
  // Regroup the raw rows into one view per attribute: each value with its
  // distinct sources (cited scholar > dictionary > rule > heuristic), so the UI
  // can corroborate agreement and flag conflicts instead of stacking raw rows.
  const grammarView = buildGrammarView(grammar);
  const hasSourcedGrammar = grammar.some((g) => g.provenance === "imported");

  // Step 2: fire remaining queries in parallel
  const [defsResult, etymResult, occsResult, lexemeFormResult, examplesResult] = await Promise.all([
    // Definitions with source info
    supabase
      .from("definitions")
      .select("id, sense_number, definition_text, cross_refs, source_url, entry_gurmukhi, notes, provenance, review_status, dict_sources(code, name, language, url)")
      .eq("word_id", wordId)
      .order("dict_source_id", { ascending: true })
      .order("sense_number", { ascending: true }),

    // Etymology
    supabase
      .from("etymology")
      .select("*")
      .eq("word_id", wordId)
      .order("order_index", { ascending: true }),

    // Occurrences with line + shabad
    supabase
      .from("word_occurrences")
      .select(`
        id, position,
        lines (
          id, ang, line_no, gurmukhi, translation_en, transliteration_en, shabad_id,
          shabads ( id, raag_english, writer_english, ang_start ),
          line_translations (
            body_unicode, language, caveat,
            translation_sources ( code, name, author, kind, notes, url )
          )
        )
      `)
      .eq("word_id", wordId)
      .order("id", { ascending: true })
      .range((occPage - 1) * OCC_PAGE_SIZE, occPage * OCC_PAGE_SIZE - 1),

    // Morphological variants: find the lexeme this word belongs to (if any)
    supabase
      .from("word_forms")
      .select("lexeme_id, inflection_desc")
      .eq("word_id", wordId)
      .maybeSingle(),

    // Dictionary example quotations (Shackle etc.) — English translation + AG
    // citation. The romanized quote (quote_roman) is internal and not selected.
    supabase
      .from("dict_examples")
      .select("id, definition_id, order_index, translation, citation_raw, citation_siglum, citation_hymn, citation_verse, citation_author")
      .eq("word_id", wordId)
      .order("id", { ascending: true }),
  ]);

  const definitions = (defsResult.data ?? []) as unknown as DefinitionWithSource[];
  const etymology = (etymResult.data ?? []) as Etymology[];
  const examples = (examplesResult.data ?? []) as unknown as DictExample[];

  // Resolve citation sigla (siglum → work title) for this word's examples.
  const siglaTitle = new Map<string, string>();
  const siglaCodes = [...new Set(examples.map((x) => x.citation_siglum).filter((s): s is string => !!s))];
  if (siglaCodes.length > 0) {
    const { data: siglaRows } = await supabase
      .from("citation_sigla")
      .select("siglum, title")
      .eq("source_code", "shackle")
      .in("siglum", siglaCodes);
    for (const r of (siglaRows ?? []) as { siglum: string; title: string | null }[]) {
      if (r.title) siglaTitle.set(r.siglum, r.title);
    }
  }

  // Step 3: if lexeme found, fetch all sibling forms
  let morphForms: Array<{ gurmukhi: string; inflection_desc: string | null }> = [];
  if (lexemeFormResult.data?.lexeme_id) {
    const lexemeId = lexemeFormResult.data.lexeme_id as number;
    const { data: formRows } = await supabase
      .from("word_forms")
      .select("inflection_desc, words(id, gurmukhi)")
      .eq("lexeme_id", lexemeId);

    morphForms = ((formRows ?? []) as unknown as Array<{ inflection_desc: string | null; words: { id: number; gurmukhi: string } | null }>)
      .filter((f) => f.words?.gurmukhi && f.words.gurmukhi !== word)
      .map((f) => ({ gurmukhi: f.words!.gurmukhi, inflection_desc: f.inflection_desc }));
  }

  // Group definitions by source
  const defsBySource = new Map<string, { sourceName: string; sourceUrl: string | null; provenance: string | null; reviewStatus: string | null; defs: DefinitionWithSource[] }>();
  for (const def of definitions) {
    const src = def.dict_sources as unknown as { code: string; name: string; url: string | null } | null;
    const key = src?.code ?? "unknown";
    if (!defsBySource.has(key)) {
      defsBySource.set(key, { sourceName: src?.name ?? key, sourceUrl: src?.url ?? null, provenance: def.provenance ?? null, reviewStatus: def.review_status ?? null, defs: [] });
    }
    defsBySource.get(key)!.defs.push(def);
  }

  // Occurrences — group by raag
  type LineCommentary = {
    body_unicode: string;
    language: string;
    caveat: string | null;
    translation_sources: {
      code: string; name: string; author: string | null; kind: string;
      notes: string | null; url: string | null;
    } | null;
  };
  type OccRow = {
    id: number;
    position: number;
    lines: {
      id: number; ang: number; line_no: number; gurmukhi: string;
      translation_en: string | null; transliteration_en: string | null;
      shabad_id: number;
      shabads: { id: number; raag_english: string | null; writer_english: string | null } | null;
      line_translations: LineCommentary[] | null;
    } | null;
  };
  const rows = (occsResult.data ?? []) as unknown as OccRow[];
  const grouped = new Map<string, OccRow[]>();
  for (const occ of rows) {
    const raag = occ.lines?.shabads?.raag_english ?? "Unknown";
    if (!grouped.has(raag)) grouped.set(raag, []);
    grouped.get(raag)!.push(occ);
  }

  function highlightWord(text: string, target: string) {
    const idx = text.indexOf(target);
    if (idx === -1) return text;
    return (
      text.slice(0, idx) +
      `<mark style="background:var(--accent-light,#f5e5d0);border-radius:3px;padding:0 2px;">${target}</mark>` +
      text.slice(idx + target.length)
    );
  }

  // Grammar display helpers
  const GRAMMAR_LABELS: Record<string, string> = {
    noun: "Noun", verb: "Verb", adjective: "Adjective", adverb: "Adverb",
    pronoun: "Pronoun", particle: "Particle", postposition: "Postposition",
    conjunction: "Conjunction", interjection: "Interjection", "proper noun": "Proper Noun",
  };
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  // Order per-line commentaries: Sahib Singh first, Faridkot (archaic) last.
  const COMMENTARY_ORDER = ["ss_darpan", "ss_padarth", "manmohan_pa", "manmohan_en", "faridkot"];
  const commentaryRank = (code: string | undefined) => {
    const i = COMMENTARY_ORDER.indexOf(code ?? "");
    return i === -1 ? 99 : i;
  };
  // Display a grammar value: POS uses the long label table, others just capitalize.
  const fmtGrammar = (attribute: string, value: string) =>
    attribute === "pos" ? GRAMMAR_LABELS[value.toLowerCase()] ?? value : cap(value);
  // Map a source kind to the existing provenance pill, an honest tier label, and
  // the adjective used when noting a disagreeing reading.
  const KIND_PROVENANCE: Record<string, string> = {
    scholar: "imported", dictionary: "scraped", rule: "rule_derived", heuristic: "computed",
  };
  const KIND_TIER: Record<string, string> = {
    scholar: "Read from a cited source", dictionary: "Read from a cited source",
    rule: "Established grammar rule", heuristic: "Our grouping heuristic",
  };
  const KIND_WORD: Record<string, string> = {
    scholar: "cited", dictionary: "dictionary", rule: "rule-derived", heuristic: "heuristic",
  };

  // Usage tab: common phrases (bigrams) + statistical collocations. Fetch the
  // pair rows, then resolve partner word_ids to Gurmukhi in one follow-up query.
  let phrases: Array<{ w1: string; w2: string; count: number }> = [];
  let collocates: Array<{ partner: string; count: number; pmi: number | null }> = [];
  let writerStats: Array<{ writer: string; count: number }> = [];
  if (tab === "usage") {
    const [bgRes, colRes, wsRes] = await Promise.all([
      supabase.from("bigrams").select("w1_id, w2_id, pair_count")
        .or(`w1_id.eq.${wordId},w2_id.eq.${wordId}`)
        .order("pair_count", { ascending: false }).limit(15),
      supabase.from("collocations").select("word_a_id, word_b_id, pair_count, pmi")
        .or(`word_a_id.eq.${wordId},word_b_id.eq.${wordId}`)
        .order("pmi", { ascending: false }).limit(15),
      // writer_english requires migration 008; before it is applied this errors
      // and degrades to an empty list (we only read .data).
      supabase.from("word_writer_stats").select("writer_english, occurrence_count")
        .eq("word_id", wordId)
        .order("occurrence_count", { ascending: false }).limit(8),
    ]);
    const bgRows = (bgRes.data ?? []) as Array<{ w1_id: number; w2_id: number; pair_count: number }>;
    const colRows = (colRes.data ?? []) as Array<{ word_a_id: number; word_b_id: number; pair_count: number; pmi: number | null }>;
    const partnerIds = new Set<number>();
    for (const r of bgRows) { partnerIds.add(r.w1_id); partnerIds.add(r.w2_id); }
    for (const r of colRows) { partnerIds.add(r.word_a_id); partnerIds.add(r.word_b_id); }
    const { data: partnerWords } = partnerIds.size
      ? await supabase.from("words").select("id, gurmukhi").in("id", [...partnerIds])
      : { data: [] };
    const idToGur = new Map(((partnerWords ?? []) as Array<{ id: number; gurmukhi: string }>).map((w) => [w.id, w.gurmukhi]));
    phrases = bgRows.map((r) => ({ w1: idToGur.get(r.w1_id) ?? "?", w2: idToGur.get(r.w2_id) ?? "?", count: r.pair_count }));
    collocates = colRows.map((r) => {
      const partnerId = r.word_a_id === wordId ? r.word_b_id : r.word_a_id;
      return { partner: idToGur.get(partnerId) ?? "?", count: r.pair_count, pmi: r.pmi };
    });
    writerStats = ((wsRes.data ?? []) as Array<{ writer_english: string | null; occurrence_count: number }>)
      .filter((r) => r.writer_english)
      .map((r) => ({ writer: r.writer_english!, count: r.occurrence_count }));
  }

  return (
    <div style={{ maxWidth: "860px", margin: "0 auto", padding: "3rem 1.5rem" }}>

      {/* ── Back nav ── */}
      <a href="/" style={{ fontFamily: '"Inter", sans-serif', fontSize: "0.875rem", color: "var(--text-secondary)", textDecoration: "none", display: "inline-block", marginBottom: "2rem" }}>
        ← back to search
      </a>

      {/* ── 1. Header ── */}
      <div style={{ marginBottom: "2.5rem" }}>
        <h1 className="gurmukhi-xl" style={{ marginBottom: "0.25rem" }}>
          {word}
        </h1>
        {ipaDisplay && (
          <p
            title="Display IPA (rule-derived from Gurmukhi phoneme rules)"
            style={{
              fontFamily: '"Inter", sans-serif',
              color: "var(--text-secondary)",
              fontSize: "1.05rem",
              margin: "0.15rem 0 0.4rem",
            }}
          >
            /{ipaDisplay}/
          </p>
        )}
        {inCorpus ? (
          <span className="badge" style={{ marginTop: "0.5rem" }}>
            {wordRow.frequency.toLocaleString()} occurrences in SGGS
          </span>
        ) : (
          <div style={{ marginTop: "0.5rem", display: "flex", gap: "0.4rem", flexWrap: "wrap", alignItems: "center" }}>
            <span
              className="badge"
              title="This is a dictionary head-word (base/citation form). It does not occur as this exact form in the ingested Sri Guru Granth Sahib corpus."
              style={{ background: "#eceae6", color: "#5c574f" }}
            >
              Not attested in SGGS · dictionary head-word
            </span>
            {spellingStatus === "derived_transliteration" && (
              <span
                className="badge"
                title="No Gurmukhi is printed for this word in the source (Later-Gurus appendix); the spelling shown was reverse-transliterated from Shackle's romanization and is not yet verified."
                style={{ background: "#f6ecd9", color: "#8a6d1f" }}
              >
                Gurmukhi spelling derived — unverified
              </span>
            )}
            {spellingStatus === "unverified_ocr" && (
              <span
                className="badge"
                title="The Gurmukhi spelling is from OCR of the printed glossary and has not been verified against the corpus."
                style={{ background: "#f6ecd9", color: "#8a6d1f" }}
              >
                Gurmukhi spelling unverified (OCR)
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── Tab Navigation ── */}
      <TabNav gurmukhi={word} currentTab={tab} />

      {/* ── 2. Morphological variants (overview) ── */}
      {tab === "overview" && morphForms.length > 0 && (
        <section style={{ marginBottom: "2rem" }}>
          <SectionHeading>Forms</SectionHeading>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontFamily: '"Inter", sans-serif', fontSize: "0.85rem", color: "var(--text-secondary)" }}>
              Related forms:
            </span>
            {morphForms.map((f) => (
              <a
                key={f.gurmukhi}
                href={`/word/${encodeURIComponent(f.gurmukhi)}`}
                title={f.inflection_desc ?? undefined}
                className="gurmukhi"
                style={{ color: "var(--accent)", textDecoration: "none", fontSize: "1.1rem" }}
              >
                {f.gurmukhi}
              </a>
            ))}
          </div>
        </section>
      )}

      {/* ── 3. Definitions (overview + meanings) ── */}
      {(tab === "overview" || tab === "meanings") && defsBySource.size > 0 && (
        <section style={{ marginBottom: "2.5rem" }}>
          <SectionHeading>Definitions</SectionHeading>
          {Array.from(defsBySource.entries()).map(([code, { sourceName, sourceUrl, provenance, reviewStatus, defs }]) => (
            <div key={code} style={{ marginBottom: "1.25rem" }}>
              {/* Source name */}
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
                <span style={{ fontFamily: '"Inter", sans-serif', fontSize: "0.8rem", fontWeight: 600, color: "var(--accent)" }}>
                  {sourceName}
                </span>
                <ProvenanceBadge provenance={provenance} reviewStatus={reviewStatus} />
                {(sourceUrl || code === "mahan_kosh") && (
                  <a
                    href={code === "mahan_kosh"
                      ? `https://www.searchgurbani.com/sggs-kosh/view?Word=${encodeURIComponent(word)}`
                      : sourceUrl!}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontFamily: '"Inter", sans-serif', fontSize: "0.75rem", color: "var(--text-secondary)" }}
                  >
                    ↗
                  </a>
                )}
              </div>

              {/* Senses */}
              {defs.map((def) => (
                <div key={def.id} style={{ ...CARD, paddingTop: "0.75rem", paddingBottom: "0.75rem" }}>
                  <div style={{ display: "flex", gap: "0.6rem", alignItems: "baseline" }}>
                    {defs.length > 1 && (
                      <span style={{ fontFamily: '"Inter", sans-serif', fontSize: "0.8rem", fontWeight: 600, color: "var(--text-secondary)", minWidth: "1.2rem" }}>
                        {def.sense_number}.
                      </span>
                    )}
                    <p className="gurmukhi" style={{ margin: 0, lineHeight: 1.7 }}>
                      {def.definition_text}
                      <CrossRefTags refs={def.cross_refs as Record<string, string> | null} />
                    </p>
                  </div>
                  {def.definition_en && (
                    <p style={{ margin: "0.35rem 0 0", color: "var(--text-secondary)", fontSize: "0.95rem", fontStyle: "italic" }}>
                      {def.definition_en}
                    </p>
                  )}
                  <FlagForm
                    wordId={wordId}
                    targetTable="definitions"
                    targetId={def.id}
                    contextLabel={`Definition${defs.length > 1 ? ` ${def.sense_number}` : ""} (${sourceName})`}
                  />
                </div>
              ))}
            </div>
          ))}
        </section>
      )}

      {/* ── Meanings empty state ── */}
      {tab === "meanings" && defsBySource.size === 0 && (
        <EmptyState>No dictionary definitions ingested for this word yet.</EmptyState>
      )}

      {/* ── Examples / attestations (overview + meanings) ── */}
      {(tab === "overview" || tab === "meanings") && examples.length > 0 && (
        <section style={{ marginBottom: "2.5rem" }}>
          <SectionHeading>Examples</SectionHeading>
          <p style={{ fontFamily: '"Inter", sans-serif', fontSize: "0.8rem", color: "var(--text-secondary)", margin: "0 0 0.75rem", lineHeight: 1.5 }}>
            Attestations cited in A Guru Nanak Glossary (Christopher Shackle), with the Adi Granth reference.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {examples.map((x) => {
              const base = x.citation_siglum ? siglaTitle.get(x.citation_siglum) ?? x.citation_siglum : x.citation_raw ?? "";
              const loc = [x.citation_hymn, x.citation_verse].filter(Boolean).join(".");
              const author = x.citation_author ? ` (${x.citation_author})` : "";
              const citation = `${base}${loc ? ` ${loc}` : ""}${author}`.trim();
              return (
                <div key={x.id} style={{ ...CARD, marginBottom: 0, padding: "0.65rem 1rem" }}>
                  {x.translation ? (
                    <div style={{ fontFamily: '"Crimson Pro", Georgia, serif', fontSize: "1.05rem", color: "var(--text-primary)", lineHeight: 1.5 }}>
                      &ldquo;{x.translation}&rdquo;
                    </div>
                  ) : (
                    <div style={{ fontFamily: '"Inter", sans-serif', fontSize: "0.85rem", color: "var(--text-secondary)", fontStyle: "italic" }}>
                      Attested (no translation printed)
                    </div>
                  )}
                  {citation && (
                    <div style={{ fontFamily: '"Inter", sans-serif', fontSize: "0.78rem", color: "var(--text-secondary)", marginTop: "0.3rem" }}>
                      — {citation}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Pronunciation (overview + pronunciation) ── */}
      {(tab === "overview" || tab === "pronunciation") && (
        <section style={{ marginBottom: "2.5rem" }}>
          <SectionHeading>Pronunciation</SectionHeading>
          <div style={CARD}>
            {ipaDisplay ? (
              <div style={{ display: "flex", gap: "0.75rem", alignItems: "baseline", marginBottom: romanIso || romanPractical ? "0.5rem" : 0 }}>
                <span style={{ fontFamily: '"Inter", sans-serif', fontSize: "0.8rem", fontWeight: 600, color: "var(--text-secondary)", minWidth: "7rem" }}>IPA</span>
                <span style={{ fontFamily: '"Inter", sans-serif', fontSize: "1.05rem" }}>/{ipaDisplay}/</span>
              </div>
            ) : (
              <EmptyState>No IPA generated yet.</EmptyState>
            )}
            {romanIso && (
              <div style={{ display: "flex", gap: "0.75rem", alignItems: "baseline", marginBottom: romanPractical ? "0.5rem" : 0 }}>
                <span style={{ fontFamily: '"Inter", sans-serif', fontSize: "0.8rem", fontWeight: 600, color: "var(--text-secondary)", minWidth: "7rem" }}>ISO 15919</span>
                <span style={{ fontStyle: "italic" }}>{romanIso}</span>
              </div>
            )}
            {romanPractical && (
              <div style={{ display: "flex", gap: "0.75rem", alignItems: "baseline" }}>
                <span style={{ fontFamily: '"Inter", sans-serif', fontSize: "0.8rem", fontWeight: 600, color: "var(--text-secondary)", minWidth: "7rem" }}>Practical</span>
                <span style={{ fontStyle: "italic" }}>{romanPractical}</span>
              </div>
            )}
          </div>
          {tab === "pronunciation" && (
            <EmptyState>Audio pronunciation is planned for a later phase.</EmptyState>
          )}
        </section>
      )}

      {/* ── 4. Grammar (grammar tab) ── */}
      {tab === "grammar" && grammar.length > 0 && (
        <section style={{ marginBottom: "2.5rem" }}>
          <SectionHeading>Grammar</SectionHeading>

          {/* Honest framing: distinguish facts read from a scholar from rule-derived ones. */}
          <p style={{ fontFamily: '"Inter", sans-serif', fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.65, marginBottom: "1.25rem", maxWidth: "44rem" }}>
            {hasSourcedGrammar && (
              <>
                Entries marked <em>Imported</em> are read directly from a cited scholarly
                source: Prof. Sahib Singh&apos;s explicit grammar notes in his <em>Sri Guru
                Granth Sahib Darpan</em> pad-arth, with the line cited.{" "}
              </>
            )}
            The remaining analysis is produced by applying established Gurbani grammar
            rules (Prof. Sahib Singh&apos;s Viakaran) to each word&apos;s form, alongside the
            part-of-speech markers in its Mahan Kosh entry. That part is rule-derived and
            deterministic, not a per-word guess; where a word&apos;s ending is ambiguous we
            leave a field blank rather than assume. Expand &ldquo;How we determined this&rdquo;
            on any entry to see the exact rule or source. Unverified rules are pending
            page-level verification against the published text.
          </p>

          {grammarView.map((av: AttributeView) => {
            const lead: AttributeReading = av.readings[0];
            const others = av.readings.slice(1);
            const leadSource = lead.attestations[0];
            return (
              <div key={av.attribute} style={{ ...CARD, marginBottom: "0.75rem" }}>
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
                  <span style={{ fontFamily: '"Inter", sans-serif', fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-secondary)" }}>
                    {av.label}
                  </span>
                  <span className="badge">{fmtGrammar(av.attribute, lead.value)}</span>
                  {lead.attestations.length > 1 && (
                    <span style={{ fontFamily: '"Inter", sans-serif', fontSize: "0.7rem", fontWeight: 600, color: "#1d7333", background: "#e1f1e6", borderRadius: "999px", padding: "0.05rem 0.5rem" }}>
                      Corroborated by {lead.attestations.length} sources
                    </span>
                  )}
                  {av.conflict && (
                    <span style={{ fontFamily: '"Inter", sans-serif', fontSize: "0.68rem", fontWeight: 500, color: "var(--text-secondary)", opacity: 0.75 }}>
                      · other readings differ
                    </span>
                  )}
                  {av.polysemy && (
                    <span style={{ fontFamily: '"Inter", sans-serif', fontSize: "0.7rem", fontWeight: 600, color: "#5c574f", background: "#eceae6", borderRadius: "999px", padding: "0.05rem 0.5rem" }}>
                      Multiple senses
                    </span>
                  )}
                  <span style={{ marginLeft: "auto" }}>
                    <ProvenanceBadge provenance={KIND_PROVENANCE[leadSource.sourceKind]} reviewStatus={leadSource.verified ? "approved" : "unreviewed"} />
                  </span>
                </div>

                {/* Polysemy: the same source simply lists more than one value (senses).
                    Shown neutrally, with no "we may be wrong" framing. */}
                {av.polysemy && others.map((r) => (
                  <div key={r.value} style={{ marginTop: "0.5rem", fontFamily: '"Inter", sans-serif', fontSize: "0.8rem", color: "var(--text-secondary)", lineHeight: 1.55 }}>
                    <span className="badge" style={{ marginRight: "0.4rem", opacity: 0.85 }}>{fmtGrammar(av.attribute, r.value)}</span>
                    Also recorded by {r.attestations[0].sourceLabel} as a separate sense.
                  </div>
                ))}

                {/* Conflict: a disagreeing reading, demoted, with feedback invited.
                    Distinguish OUR reading being overruled from two real sources differing. */}
                {av.conflict && others.map((r) => {
                  const kind = r.attestations[0].sourceKind;
                  const ours = kind === "rule" || kind === "heuristic";
                  return (
                    <div key={r.value} style={{ marginTop: "0.55rem", fontFamily: '"Inter", sans-serif', fontSize: "0.8rem", color: "var(--text-secondary)", lineHeight: 1.55 }}>
                      <span style={{ textDecoration: "line-through", opacity: 0.7, marginRight: "0.4rem" }}>{fmtGrammar(av.attribute, r.value)}</span>
                      {ours
                        ? `Our ${KIND_WORD[kind]} reading disagrees with the cited source above — this rule may need adjusting.`
                        : `${r.attestations[0].sourceLabel} reads this differently; the lead source takes precedence, but the sources genuinely differ here.`}
                    </div>
                  );
                })}

                <FlagForm
                  wordId={wordId}
                  targetTable="word_grammar"
                  contextLabel={`Grammar — ${av.label}: ${fmtGrammar(av.attribute, lead.value)}`}
                />

                <details style={{ marginTop: "0.65rem", fontFamily: '"Inter", sans-serif', fontSize: "0.85rem" }}>
                  <summary style={{ cursor: "pointer", color: "var(--accent)", fontWeight: 600 }}>
                    How we determined this
                  </summary>
                  <div style={{ marginTop: "0.55rem", color: "var(--text-secondary)", lineHeight: 1.6, display: "flex", flexDirection: "column", gap: "0.7rem" }}>
                    {av.readings.map((r) => (
                      <div key={r.value}>
                        <div style={{ color: "var(--text-primary)", fontWeight: 600 }}>{fmtGrammar(av.attribute, r.value)}</div>
                        {r.attestations.map((a, i) => (
                          <div key={i} style={{ marginTop: "0.35rem" }}>
                            <div style={{ fontWeight: 600 }}>{a.sourceLabel}</div>
                            {a.explanation && <div>{a.explanation}</div>}
                            {a.citation && <div style={{ fontStyle: "italic", marginTop: "0.2rem" }}>Source: {a.citation}</div>}
                            <div style={{ marginTop: "0.25rem", fontSize: "0.78rem" }}>
                              {KIND_TIER[a.sourceKind]}
                              {" · "}
                              {a.verified ? "Verified against source" : a.confidenceLabel ? `Confidence: ${a.confidenceLabel}` : "Not yet scholar-verified"}
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </details>
              </div>
            );
          })}
        </section>
      )}

      {/* ── Grammar empty state ── */}
      {tab === "grammar" && grammar.length === 0 && (
        <EmptyState>No grammatical analysis yet. Rule-based grammar candidates arrive in a later phase.</EmptyState>
      )}

      {/* ── 5. Etymology (etymology tab) ── */}
      {tab === "etymology" && etymology.length > 0 && (
        <section style={{ marginBottom: "2.5rem" }}>
          <SectionHeading>Etymology</SectionHeading>
          <div style={CARD}>
            {etymology.map((e, i) => (
              <div key={e.id} style={{ display: "flex", gap: "0.75rem", alignItems: "baseline", flexWrap: "wrap", marginBottom: i < etymology.length - 1 ? "0.75rem" : 0 }}>
                <span style={{ fontFamily: '"Inter", sans-serif', fontSize: "0.8rem", fontWeight: 600, color: "var(--accent)", minWidth: "5rem" }}>
                  {e.origin_language}
                </span>
                <div style={{ flex: 1, minWidth: "12rem" }}>
                  <div>
                    {e.root_form && (
                      <span className="gurmukhi" style={{ marginRight: "0.4rem" }}>{e.root_form}</span>
                    )}
                    {e.root_form_roman && (
                      <span style={{ fontStyle: "italic", color: "var(--text-secondary)", fontSize: "0.9rem", marginRight: "0.4rem" }}>
                        ({e.root_form_roman})
                      </span>
                    )}
                    <ProvenanceBadge provenance={e.provenance ?? null} reviewStatus={e.review_status ?? null} />
                  </div>
                  {e.derivation_note && (
                    <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", margin: "0.3rem 0 0" }}>
                      {e.derivation_note}
                    </p>
                  )}
                  {e.source_text && (
                    <p className="gurmukhi" style={{ color: "var(--text-secondary)", fontSize: "0.85rem", margin: "0.3rem 0 0", fontStyle: "italic" }}>
                      {e.source_text}
                    </p>
                  )}
                  {/* Structured Shackle markers: CDIAL number, doublets, hedging. */}
                  {(e.cdial || e.doublet_of?.length || e.compare_forms?.length || e.is_hypothetical || (e.doubtful && e.doubtful !== "no")) && (
                    <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", alignItems: "center", marginTop: "0.4rem", fontFamily: '"Inter", sans-serif', fontSize: "0.75rem" }}>
                      {e.cdial != null && (
                        <span className="badge" title="Turner, A Comparative Dictionary of the Indo-Aryan Languages — head-word number">
                          CDIAL №{e.cdial}
                        </span>
                      )}
                      {e.is_hypothetical && (
                        <span style={{ color: "var(--text-secondary)" }} title="Reconstructed form, not directly attested (Shackle marks these with *)">
                          * hypothetical
                        </span>
                      )}
                      {e.doubtful && e.doubtful !== "no" && (
                        <span style={{ color: "var(--text-secondary)" }} title="Shackle's own hedging (? doubtful, ?? very doubtful)">
                          {e.doubtful === "very-doubtful" ? "?? very doubtful" : "? doubtful"}
                        </span>
                      )}
                      {e.doublet_of?.length ? (
                        <span style={{ color: "var(--text-secondary)" }}>doublet of {e.doublet_of.join(", ").toLowerCase()}</span>
                      ) : null}
                      {e.compare_forms?.length ? (
                        <span style={{ color: "var(--text-secondary)" }}>cf. {e.compare_forms.join(", ").toLowerCase()}</span>
                      ) : null}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Etymology empty state ── */}
      {tab === "etymology" && etymology.length === 0 && (
        <EmptyState>No etymology recorded yet. Cross-dictionary roots (Sanskrit, Farsi, Arabic) arrive in a later phase.</EmptyState>
      )}

      {/* ── Usage (usage tab) ── */}
      {tab === "usage" && (
        <>
          <section style={{ marginBottom: "2.5rem" }}>
            <SectionHeading>Common phrases</SectionHeading>
            {phrases.length === 0 ? (
              <EmptyState>No recurring two-word phrases for this word.</EmptyState>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                {phrases.map((p, i) => (
                  <div key={i} style={{ ...CARD, marginBottom: 0, display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "0.6rem 1rem" }}>
                    <span className="gurmukhi" style={{ fontSize: "1.2rem" }}>
                      <span style={{ color: p.w1 === word ? "var(--accent)" : "inherit", fontWeight: p.w1 === word ? 600 : 400 }}>{p.w1}</span>
                      {" "}
                      <span style={{ color: p.w2 === word ? "var(--accent)" : "inherit", fontWeight: p.w2 === word ? 600 : 400 }}>{p.w2}</span>
                    </span>
                    <span style={{ fontFamily: '"Inter", sans-serif', fontSize: "0.8rem", color: "var(--text-secondary)" }}>{p.count}×</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section style={{ marginBottom: "2.5rem" }}>
            <SectionHeading>Frequently appears near</SectionHeading>
            {collocates.length === 0 ? (
              <EmptyState>No strong collocations (within 3 words) for this word.</EmptyState>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                {collocates.map((c, i) => (
                  <a
                    key={i}
                    href={`/word/${encodeURIComponent(c.partner)}`}
                    title={`${c.count}× nearby${c.pmi != null ? ` · PMI ${c.pmi.toFixed(1)}` : ""}`}
                    style={{ ...CARD, marginBottom: 0, padding: "0.4rem 0.8rem", textDecoration: "none", display: "inline-flex", alignItems: "baseline", gap: "0.4rem" }}
                  >
                    <span className="gurmukhi" style={{ fontSize: "1.1rem", color: "var(--accent)" }}>{c.partner}</span>
                    <span style={{ fontFamily: '"Inter", sans-serif', fontSize: "0.75rem", color: "var(--text-secondary)" }}>{c.count}×</span>
                  </a>
                ))}
              </div>
            )}
          </section>

          <section style={{ marginBottom: "2.5rem" }}>
            <SectionHeading>Most used by</SectionHeading>
            {writerStats.length === 0 ? (
              <EmptyState>No writer breakdown available yet.</EmptyState>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                {writerStats.map((ws, i) => (
                  <div key={i} style={{ ...CARD, marginBottom: 0, display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "0.6rem 1rem" }}>
                    <span style={{ fontFamily: '"Inter", sans-serif' }}>{ws.writer}</span>
                    <span style={{ fontFamily: '"Inter", sans-serif', fontSize: "0.8rem", color: "var(--text-secondary)" }}>{ws.count.toLocaleString()}×</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {/* ── 6. Occurrences (occurrences tab) ── */}
      {tab === "occurrences" && (
      <section>
        <SectionHeading>
          Occurrences in Sri Guru Granth Sahib Ji
          {wordRow.frequency > 0 && (
            <span style={{ fontWeight: 400, marginLeft: "0.5rem", textTransform: "none", letterSpacing: 0 }}>
              ({((occPage - 1) * OCC_PAGE_SIZE + 1).toLocaleString()}–{Math.min(occPage * OCC_PAGE_SIZE, wordRow.frequency).toLocaleString()} of {wordRow.frequency.toLocaleString()})
            </span>
          )}
        </SectionHeading>

        {grouped.size === 0 && (
          <p style={{ color: "var(--text-secondary)", fontStyle: "italic" }}>
            No occurrences indexed yet.
          </p>
        )}

        {Array.from(grouped.entries()).map(([raag, occs]) => (
          <div key={raag} style={{ marginBottom: "2rem" }}>
            <h3 style={{ fontSize: "1rem", fontStyle: "italic", color: "var(--text-secondary)", marginBottom: "0.75rem", borderBottom: "1px solid var(--border)", paddingBottom: "0.25rem" }}>
              {raag}
            </h3>
            {occs.map((occ) => {
              const line = occ.lines;
              if (!line) return null;
              return (
                <div key={occ.id} style={{ ...CARD, marginBottom: "0.75rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.6rem" }}>
                    <a href={`/ang/${line.ang}`} style={{ fontFamily: '"Inter", sans-serif', fontSize: "0.8rem", color: "var(--accent)", fontWeight: 500 }}>
                      Ang {line.ang}
                    </a>
                    {line.shabads?.writer_english && (
                      <span style={{ fontFamily: '"Inter", sans-serif', fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                        {line.shabads.writer_english}
                      </span>
                    )}
                  </div>
                  <p className="gurmukhi-lg" style={{ marginBottom: "0.4rem" }} dangerouslySetInnerHTML={{ __html: highlightWord(line.gurmukhi, word) }} />
                  {line.transliteration_en && (
                    <p style={{ fontStyle: "italic", color: "var(--text-secondary)", fontSize: "0.95rem", marginBottom: "0.4rem" }}>
                      {line.transliteration_en}
                    </p>
                  )}
                  {line.translation_en && (
                    <p style={{ color: "var(--text-secondary)", fontSize: "1rem" }}>
                      {line.translation_en}
                    </p>
                  )}

                  {line.line_translations && line.line_translations.length > 0 && (
                    <details style={{ marginTop: "0.65rem", fontFamily: '"Inter", sans-serif' }}>
                      <summary style={{ cursor: "pointer", color: "var(--accent)", fontWeight: 600, fontSize: "0.82rem" }}>
                        Commentaries &amp; translations ({line.line_translations.length})
                      </summary>
                      <div style={{ marginTop: "0.6rem", display: "flex", flexDirection: "column", gap: "0.85rem" }}>
                        {[...line.line_translations]
                          .sort((a, b) => commentaryRank(a.translation_sources?.code) - commentaryRank(b.translation_sources?.code))
                          .map((c, i) => {
                            const src = c.translation_sources;
                            return (
                              <div key={i} style={{ borderLeft: "2px solid var(--border)", paddingLeft: "0.7rem" }}>
                                <div style={{ fontSize: "0.76rem", color: "var(--text-secondary)", fontWeight: 600, marginBottom: "0.2rem" }}>
                                  {src?.name}{src?.author ? ` · ${src.author}` : ""}
                                  {src?.kind === "padarth" ? " · word meanings" : ""}
                                </div>
                                <p
                                  className={c.language === "pa" ? "gurmukhi" : undefined}
                                  style={{ margin: 0, color: "var(--text-primary)", lineHeight: 1.7, fontSize: c.language === "pa" ? "1.05rem" : "0.95rem" }}
                                >
                                  {c.body_unicode}
                                </p>
                                {(c.caveat ?? src?.notes) && (
                                  <p style={{ margin: "0.25rem 0 0", fontSize: "0.72rem", color: "var(--text-secondary)", fontStyle: "italic" }}>
                                    {c.caveat ?? src?.notes}
                                  </p>
                                )}
                              </div>
                            );
                          })}
                        <p style={{ margin: 0, fontSize: "0.72rem", color: "var(--text-secondary)" }}>
                          Punjabi commentaries are shown in the original, not machine-translated. Sourced via BaniDB.
                        </p>
                      </div>
                    </details>
                  )}
                </div>
              );
            })}
          </div>
        ))}

        {wordRow.frequency > OCC_PAGE_SIZE && (
          <nav style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "1.5rem", paddingTop: "1rem", borderTop: "1px solid var(--border)", fontFamily: '"Inter", sans-serif', fontSize: "0.9rem" }}>
            {occPage > 1 ? (
              <a href={`/word/${encodeURIComponent(word)}?tab=occurrences&page=${occPage - 1}`} style={{ color: "var(--accent)", textDecoration: "none" }}>← Previous</a>
            ) : <span />}
            <span style={{ color: "var(--text-secondary)" }}>
              Page {occPage} of {Math.max(1, Math.ceil(wordRow.frequency / OCC_PAGE_SIZE)).toLocaleString()}
            </span>
            {occPage * OCC_PAGE_SIZE < wordRow.frequency ? (
              <a href={`/word/${encodeURIComponent(word)}?tab=occurrences&page=${occPage + 1}`} style={{ color: "var(--accent)", textDecoration: "none" }}>Next →</a>
            ) : <span />}
          </nav>
        )}
      </section>
      )}

      {/* ── 7. Sources & provenance (sources tab) ── */}
      {tab === "sources" && (
        <section>
          <SectionHeading>Sources &amp; provenance</SectionHeading>
          {defsBySource.size === 0 && grammar.length === 0 && (
            <EmptyState>No sourced data yet for this word.</EmptyState>
          )}
          {defsBySource.size > 0 &&
            Array.from(defsBySource.entries()).map(([key, group]) => (
              <div key={key} style={{ ...CARD, display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem" }}>
                <div>
                  <span style={{ fontFamily: '"Inter", sans-serif', fontWeight: 600 }}>{group.sourceName}</span>
                  <span style={{ fontFamily: '"Inter", sans-serif', fontSize: "0.85rem", color: "var(--text-secondary)", marginLeft: "0.5rem" }}>
                    {group.defs.length} {group.defs.length === 1 ? "sense" : "senses"}
                  </span>
                </div>
                <ProvenanceBadge provenance={group.provenance} reviewStatus={group.reviewStatus} />
              </div>
            ))}

          {/* Grammar provenance: be explicit that grammar is rule-derived. */}
          {grammar.length > 0 && (
            <div style={{ ...CARD, display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem" }}>
              <div>
                <span style={{ fontFamily: '"Inter", sans-serif', fontWeight: 600 }}>Grammar analysis</span>
                <span style={{ fontFamily: '"Inter", sans-serif', fontSize: "0.85rem", color: "var(--text-secondary)", marginLeft: "0.5rem" }}>
                  rule-derived from Sahib Singh&apos;s Viakaran + Mahan Kosh markers (see the Grammar tab for each rule and its source)
                </span>
              </div>
              <ProvenanceBadge provenance="rule_derived" reviewStatus="unreviewed" />
            </div>
          )}

          {/* Planned source, pending permission (reminder + public transparency). */}
          <div style={{ ...CARD, borderStyle: "dashed" }}>
            <span style={{ fontFamily: '"Inter", sans-serif', fontWeight: 600 }}>Planned: SikhRI — The Guru Granth Sahib Dictionary</span>
            <p style={{ fontFamily: '"Inter", sans-serif', fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.6, marginTop: "0.35rem", marginBottom: 0 }}>
              We intend to incorporate SikhRI&apos;s per-word meanings and grammar, with full attribution,
              once we receive their permission. Not yet integrated.
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
