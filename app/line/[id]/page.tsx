import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { pageTitle } from "@/lib/site";
import { fetchLineContext, lineParts, placeLabel } from "@/lib/line-context";
import { CommentaryPicker, LINES_ID } from "@/components/line/CommentaryPicker";

// One line in its shabad (#146). A line's context changes only on an ingest,
// so each page is rendered on its first request and refreshed daily.
export const revalidate = 86400;
export function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ id: string }> };

const parseId = (s: string) => (/^\d+$/.test(s) ? Number(s) : null);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const id = parseId((await params).id);
  const ctx = id ? await fetchLineContext(id) : null;
  const line = ctx?.lines.find((l) => l.id === ctx.lineId);
  return { title: pageTitle(line ? line.gurmukhi.replace(/\s*॥.*$/, "") : "Line") };
}

const META: React.CSSProperties = { fontFamily: '"Inter", sans-serif', fontSize: "0.85rem", color: "var(--text-secondary)" };
const NAV: React.CSSProperties = { fontFamily: '"Inter", sans-serif', fontSize: "0.875rem", color: "var(--accent)" };

export default async function LinePage({ params }: Props) {
  const id = parseId((await params).id);
  if (!id) notFound();
  const ctx = await fetchLineContext(id);
  if (!ctx) notFound();

  const first = ctx.lines[0];
  const code = ctx.source?.code ?? null;
  const sggs = code === "sggs_banidb_v2";
  const angs = [...new Set(ctx.lines.map((l) => l.ang))];
  const place = angs.length > 1
    ? `${placeLabel(code, angs[0])}–${angs.at(-1)}`
    : placeLabel(code, first?.ang ?? 0);

  // Every commentary is rendered, hidden; the picker sets data-commentary on
  // the line list and these rules show the chosen source under each line.
  const sourceName = new Map(ctx.commentarySources.map((src) => [src.code, src]));
  const commentaryCss = ctx.commentarySources
    .map((src) => `#${LINES_ID}[data-commentary="${src.code}"] .viewer-cm[data-src="${src.code}"]{display:block}`)
    .join("");

  const nav = (
    <nav style={{ display: "flex", gap: "1rem", alignItems: "baseline" }}>
      {ctx.prevId != null && <a href={`/line/${ctx.prevId}`} style={NAV}>← Previous</a>}
      <a href="/" style={{ ...NAV, color: "var(--text-secondary)", textDecoration: "none" }}>search</a>
      {ctx.nextId != null && <a href={`/line/${ctx.nextId}`} style={{ ...NAV, marginLeft: "auto" }}>Next →</a>}
    </nav>
  );

  return (
    <div style={{ maxWidth: "860px", margin: "0 auto", padding: "2.5rem 1.5rem 4rem" }}>
      {nav}

      <header style={{ margin: "1.75rem 0 1.5rem", display: "flex", flexWrap: "wrap", gap: "0.25rem 1.25rem", alignItems: "baseline" }}>
        <span style={{ ...META, fontWeight: 600, color: "var(--text-primary)" }}>{ctx.source?.name ?? "Gurbani"}</span>
        {sggs && angs.length === 1
          ? <a href={`/ang/${first.ang}`} style={META}>{place}</a>
          : <span style={META}>{place}</span>}
        {ctx.shabad?.raag_gurmukhi && (
          <span style={META}>
            <span className="gurmukhi">{ctx.shabad.raag_gurmukhi}</span>
            {ctx.shabad.raag_english ? ` (${ctx.shabad.raag_english})` : ""}
          </span>
        )}
        {ctx.shabad?.writer_english && <span style={META}>{ctx.shabad.writer_english}</span>}
      </header>

      <div style={{ marginBottom: "1.25rem" }}>
        <CommentaryPicker sources={ctx.commentarySources} />
      </div>
      <style>{commentaryCss}</style>

      <div id={LINES_ID} data-commentary="off" style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
        {ctx.lines.map((line) => (
          <div key={line.id} id={`line-${line.id}`} className="viewer-line">
            <p className="gurmukhi-lg" style={{ marginBottom: "0.2rem" }}>
              {lineParts(line.gurmukhi).map((part, i) =>
                part.word
                  ? <a key={i} className="viewer-word" href={`/word/${encodeURIComponent(part.word)}`}>{part.text}</a>
                  : <span key={i}>{part.text}</span>,
              )}
            </p>
            {line.transliteration_en && (
              <p style={{ fontStyle: "italic", color: "var(--text-secondary)", fontSize: "0.95rem", marginBottom: "0.15rem" }}>
                {line.transliteration_en}
              </p>
            )}
            {line.translation_en && (
              <p style={{ color: "var(--text-secondary)", fontSize: "1rem" }}>{line.translation_en}</p>
            )}
            {(ctx.commentaries.get(line.id) ?? []).map((c) => {
              const src = sourceName.get(c.source_code);
              return (
                <div key={c.source_code} className="viewer-cm" data-src={c.source_code}>
                  <p className={c.language === "pa" ? "gurmukhi" : undefined} style={{ fontSize: c.language === "pa" ? "1.05rem" : "1rem" }}>
                    {c.body_unicode}
                  </p>
                  <p className="viewer-cm-source">
                    {src ? `${src.name}${src.author ? ` · ${src.author}` : ""}` : c.source_code}
                    {c.caveat && <> · <em>{c.caveat}</em></>}
                  </p>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div style={{ marginTop: "2.5rem" }}>{nav}</div>
    </div>
  );
}
