import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ gurmukhi: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { gurmukhi } = await params;
  const word = decodeURIComponent(gurmukhi);
  return {
    title: `${word} — Gurmukhi Kosh`,
    description: `Dictionary entry for the Gurmukhi word ${word} as found in Sri Guru Granth Sahib Ji.`,
  };
}

export default async function WordPage({ params }: Props) {
  const { gurmukhi: encoded } = await params;
  const word = decodeURIComponent(encoded);

  // Fetch word record
  const { data: wordRow } = await supabase
    .from("words")
    .select("*")
    .eq("gurmukhi", word)
    .single();

  if (!wordRow) notFound();

  // Fetch occurrences with line + shabad data (paginated — first 100)
  const { data: occurrences } = await supabase
    .from("word_occurrences")
    .select(
      `
      id, position,
      lines (
        id, ang, line_no, gurmukhi, translation_en, transliteration_en, shabad_id,
        shabads ( id, raag_english, writer_english, ang_start )
      )
    `
    )
    .eq("word_id", wordRow.id)
    .order("id", { ascending: true })
    .limit(100);

  // Fetch Mahan Kosh refs
  const { data: mahanKosh } = await supabase
    .from("mahan_kosh_refs")
    .select("*")
    .eq("word_id", wordRow.id);

  type OccRow = {
    id: number;
    position: number;
    lines: {
      id: number;
      ang: number;
      line_no: number;
      gurmukhi: string;
      translation_en: string | null;
      transliteration_en: string | null;
      shabad_id: number;
      shabads: { id: number; raag_english: string | null; writer_english: string | null } | null;
    } | null;
  };
  const rows = (occurrences ?? []) as unknown as OccRow[];

  // Group occurrences by raag for display
  const grouped = new Map<string, OccRow[]>();
  for (const occ of rows) {
    const raag = occ.lines?.shabads?.raag_english ?? "Unknown Raag";
    if (!grouped.has(raag)) grouped.set(raag, []);
    grouped.get(raag)!.push(occ);
  }

  function highlightWord(text: string, target: string) {
    const idx = text.indexOf(target);
    if (idx === -1) return text;
    return (
      text.slice(0, idx) +
      `<mark style="background:var(--accent-light);border-radius:3px;padding:0 2px;">${target}</mark>` +
      text.slice(idx + target.length)
    );
  }

  return (
    <div style={{ maxWidth: "860px", margin: "0 auto", padding: "3rem 1.5rem" }}>
      {/* Back nav */}
      <a
        href="/"
        style={{
          fontFamily: '"Inter", sans-serif',
          fontSize: "0.875rem",
          color: "var(--text-secondary)",
          textDecoration: "none",
          display: "inline-block",
          marginBottom: "2rem",
        }}
      >
        ← back to search
      </a>

      {/* Word header */}
      <div style={{ marginBottom: "2.5rem" }}>
        <h1 className="gurmukhi-xl" style={{ marginBottom: "0.25rem" }}>
          {word}
        </h1>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "1rem",
            marginTop: "0.5rem",
          }}
        >
          <span className="badge">{wordRow.frequency.toLocaleString()} occurrences in SGGS</span>
        </div>
      </div>

      {/* Mahan Kosh section */}
      {mahanKosh && mahanKosh.length > 0 && (
        <section style={{ marginBottom: "2.5rem" }}>
          <h2
            style={{
              fontSize: "1rem",
              fontFamily: '"Inter", sans-serif',
              fontWeight: 600,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              color: "var(--text-secondary)",
              marginBottom: "0.75rem",
            }}
          >
            Mahan Kosh
          </h2>
          {mahanKosh.map((ref) => (
            <div key={ref.id} className="card" style={{ marginBottom: "0.75rem" }}>
              {ref.entry_gurmukhi && (
                <p className="gurmukhi" style={{ fontWeight: 600, marginBottom: "0.4rem" }}>
                  {ref.entry_gurmukhi}
                </p>
              )}
              {ref.definition && (
                <p style={{ color: "var(--text-secondary)", marginBottom: "0.25rem" }}>
                  {ref.definition}
                </p>
              )}
              {ref.notes && (
                <p
                  style={{
                    fontStyle: "italic",
                    color: "var(--text-secondary)",
                    fontSize: "0.95rem",
                  }}
                >
                  {ref.notes}
                </p>
              )}
              {ref.source_url && (
                <a
                  href={ref.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: "0.875rem", fontFamily: '"Inter", sans-serif' }}
                >
                  Source ↗
                </a>
              )}
            </div>
          ))}
        </section>
      )}

      {/* Occurrences */}
      <section>
        <h2
          style={{
            fontSize: "1rem",
            fontFamily: '"Inter", sans-serif',
            fontWeight: 600,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            color: "var(--text-secondary)",
            marginBottom: "1.25rem",
          }}
        >
          Occurrences in Sri Guru Granth Sahib Ji
          {rows.length >= 100 && (
            <span style={{ fontWeight: 400, marginLeft: "0.5rem" }}>
              (showing first 100)
            </span>
          )}
        </h2>

        {grouped.size === 0 && (
          <p style={{ color: "var(--text-secondary)", fontStyle: "italic" }}>
            No occurrences indexed yet.
          </p>
        )}

        {Array.from(grouped.entries()).map(([raag, occs]) => (
          <div key={raag} style={{ marginBottom: "2rem" }}>
            <h3
              style={{
                fontSize: "1rem",
                fontStyle: "italic",
                color: "var(--text-secondary)",
                marginBottom: "0.75rem",
                borderBottom: "1px solid var(--border)",
                paddingBottom: "0.25rem",
              }}
            >
              {raag}
            </h3>
            {occs?.map((occ) => {
              const line = occ.lines;
              if (!line) return null;

              return (
                <div
                  key={occ.id}
                  className="card"
                  style={{ marginBottom: "0.75rem" }}
                >
                  {/* Ang reference */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "baseline",
                      marginBottom: "0.6rem",
                    }}
                  >
                    <a
                      href={`/ang/${line.ang}`}
                      style={{
                        fontFamily: '"Inter", sans-serif',
                        fontSize: "0.8rem",
                        color: "var(--accent)",
                        fontWeight: 500,
                      }}
                    >
                      Ang {line.ang}
                    </a>
                    {line.shabads?.writer_english && (
                      <span
                        style={{
                          fontFamily: '"Inter", sans-serif',
                          fontSize: "0.8rem",
                          color: "var(--text-secondary)",
                        }}
                      >
                        {line.shabads.writer_english}
                      </span>
                    )}
                  </div>

                  {/* Gurmukhi line with word highlighted */}
                  <p
                    className="gurmukhi-lg"
                    style={{ marginBottom: "0.4rem" }}
                    dangerouslySetInnerHTML={{
                      __html: highlightWord(line.gurmukhi, word),
                    }}
                  />

                  {/* Transliteration */}
                  {line.transliteration_en && (
                    <p
                      style={{
                        fontStyle: "italic",
                        color: "var(--text-secondary)",
                        fontSize: "0.95rem",
                        marginBottom: "0.4rem",
                      }}
                    >
                      {line.transliteration_en}
                    </p>
                  )}

                  {/* Translation */}
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
    </div>
  );
}
