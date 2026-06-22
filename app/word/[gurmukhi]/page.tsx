import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { Metadata } from "next";
import type { DefinitionWithSource, Etymology, WordGrammar } from "@/lib/supabase";
import { ProvenanceBadge } from "@/components/word/ProvenanceBadge";
import { TabNav } from "@/components/word/TabNav";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ gurmukhi: string }>;
  searchParams: Promise<{ tab?: string }>;
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
  const { tab = "overview" } = await searchParams;
  const word = decodeURIComponent(encoded);

  // Step 1: fetch word + grammar together
  const { data: wordRow } = await supabase
    .from("words")
    .select("id, gurmukhi, frequency, ipa_display, roman_iso15919, roman_practical, word_grammar(*)")
    .eq("gurmukhi", word)
    .single();

  if (!wordRow) notFound();

  const wordId = wordRow.id;
  const ipaDisplay = (wordRow as unknown as { ipa_display: string | null }).ipa_display;
  const romanIso = (wordRow as unknown as { roman_iso15919: string | null }).roman_iso15919;
  const romanPractical = (wordRow as unknown as { roman_practical: string | null }).roman_practical;
  const grammar = ((wordRow as unknown as { word_grammar: WordGrammar[] }).word_grammar ?? []);

  // Step 2: fire remaining queries in parallel
  const [defsResult, etymResult, occsResult, lexemeFormResult] = await Promise.all([
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
          shabads ( id, raag_english, writer_english, ang_start )
        )
      `)
      .eq("word_id", wordId)
      .order("id", { ascending: true })
      .limit(100),

    // Morphological variants: find the lexeme this word belongs to (if any)
    supabase
      .from("word_forms")
      .select("lexeme_id, inflection_desc")
      .eq("word_id", wordId)
      .maybeSingle(),
  ]);

  const definitions = (defsResult.data ?? []) as unknown as DefinitionWithSource[];
  const etymology = (etymResult.data ?? []) as Etymology[];

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
  type OccRow = {
    id: number;
    position: number;
    lines: {
      id: number; ang: number; line_no: number; gurmukhi: string;
      translation_en: string | null; transliteration_en: string | null;
      shabad_id: number;
      shabads: { id: number; raag_english: string | null; writer_english: string | null } | null;
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

  // Usage tab: common phrases (bigrams) + statistical collocations. Fetch the
  // pair rows, then resolve partner word_ids to Gurmukhi in one follow-up query.
  let phrases: Array<{ w1: string; w2: string; count: number }> = [];
  let collocates: Array<{ partner: string; count: number; pmi: number | null }> = [];
  if (tab === "usage") {
    const [bgRes, colRes] = await Promise.all([
      supabase.from("bigrams").select("w1_id, w2_id, pair_count")
        .or(`w1_id.eq.${wordId},w2_id.eq.${wordId}`)
        .order("pair_count", { ascending: false }).limit(15),
      supabase.from("collocations").select("word_a_id, word_b_id, pair_count, pmi")
        .or(`word_a_id.eq.${wordId},word_b_id.eq.${wordId}`)
        .order("pmi", { ascending: false }).limit(15),
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
        <span className="badge" style={{ marginTop: "0.5rem" }}>
          {wordRow.frequency.toLocaleString()} occurrences in SGGS
        </span>
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
          {grammar.map((g) => (
            <div key={g.id} style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
              {g.pos && (
                <span className="badge">
                  {GRAMMAR_LABELS[g.pos.toLowerCase()] ?? g.pos}
                </span>
              )}
              {g.gender && (
                <span className="badge">
                  {g.gender.charAt(0).toUpperCase() + g.gender.slice(1)}
                </span>
              )}
              {g.number && (
                <span className="badge">
                  {g.number.charAt(0).toUpperCase() + g.number.slice(1)}
                </span>
              )}
              {g.gram_case && (
                <span className="badge">
                  {g.gram_case.charAt(0).toUpperCase() + g.gram_case.slice(1)}
                </span>
              )}
              {g.notes && (
                <span style={{ fontFamily: '"Inter", sans-serif', fontSize: "0.875rem", color: "var(--text-secondary)", fontStyle: "italic" }}>
                  {g.notes}
                </span>
              )}
            </div>
          ))}
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
              <div key={e.id} style={{ display: "flex", gap: "0.75rem", alignItems: "baseline", marginBottom: i < etymology.length - 1 ? "0.5rem" : 0 }}>
                <span style={{ fontFamily: '"Inter", sans-serif', fontSize: "0.8rem", fontWeight: 600, color: "var(--accent)", minWidth: "5rem" }}>
                  {e.origin_language}
                </span>
                <div>
                  {e.root_form && (
                    <span className="gurmukhi" style={{ marginRight: "0.4rem" }}>{e.root_form}</span>
                  )}
                  {e.root_form_roman && (
                    <span style={{ fontStyle: "italic", color: "var(--text-secondary)", fontSize: "0.9rem", marginRight: "0.4rem" }}>
                      ({e.root_form_roman})
                    </span>
                  )}
                  {e.derivation_note && (
                    <span style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>
                      {e.derivation_note}
                    </span>
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
        </>
      )}

      {/* ── 6. Occurrences (occurrences tab) ── */}
      {tab === "occurrences" && (
      <section>
        <SectionHeading>
          Occurrences in Sri Guru Granth Sahib Ji
          {rows.length >= 100 && (
            <span style={{ fontWeight: 400, marginLeft: "0.5rem", textTransform: "none", letterSpacing: 0 }}>
              (showing first 100)
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
                </div>
              );
            })}
          </div>
        ))}
      </section>
      )}

      {/* ── 7. Sources & provenance (sources tab) ── */}
      {tab === "sources" && (
        <section>
          <SectionHeading>Sources &amp; provenance</SectionHeading>
          {defsBySource.size === 0 ? (
            <EmptyState>No sourced data yet for this word.</EmptyState>
          ) : (
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
            ))
          )}
        </section>
      )}
    </div>
  );
}
