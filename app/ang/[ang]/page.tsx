import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ ang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { ang } = await params;
  return { title: `Ang ${ang} — Gurmukhi Kosh` };
}

export default async function AngPage({ params }: Props) {
  const { ang: angParam } = await params;
  const ang = parseInt(angParam);

  if (isNaN(ang) || ang < 1 || ang > 1430) notFound();

  const { data: lines } = await supabase
    .from("lines")
    .select("*, shabads(raag_english, writer_english)")
    .eq("ang", ang)
    .order("line_no", { ascending: true });

  if (!lines || lines.length === 0) {
    return (
      <div style={{ maxWidth: "860px", margin: "0 auto", padding: "3rem 1.5rem" }}>
        <a href="/" style={{ fontFamily: '"Inter", sans-serif', fontSize: "0.875rem", color: "var(--text-secondary)", textDecoration: "none" }}>
          ← search
        </a>
        <p style={{ marginTop: "2rem", fontStyle: "italic", color: "var(--text-secondary)" }}>
          Ang {ang} has not been indexed yet.
        </p>
      </div>
    );
  }

  const shabad = (lines[0] as { shabads?: { raag_english?: string | null; writer_english?: string | null } | null }).shabads;

  return (
    <div style={{ maxWidth: "860px", margin: "0 auto", padding: "3rem 1.5rem" }}>
      <div style={{ marginBottom: "2rem" }}>
        <div style={{ display: "flex", gap: "1rem", marginBottom: "1rem" }}>
          {ang > 1 && (
            <a href={`/ang/${ang - 1}`} style={{ fontFamily: '"Inter", sans-serif', fontSize: "0.875rem", color: "var(--accent)" }}>
              ← Ang {ang - 1}
            </a>
          )}
          <a href="/" style={{ fontFamily: '"Inter", sans-serif', fontSize: "0.875rem", color: "var(--text-secondary)", textDecoration: "none" }}>
            search
          </a>
          {ang < 1430 && (
            <a href={`/ang/${ang + 1}`} style={{ fontFamily: '"Inter", sans-serif', fontSize: "0.875rem", color: "var(--accent)", marginLeft: "auto" }}>
              Ang {ang + 1} →
            </a>
          )}
        </div>

        <h1 style={{ fontSize: "1.5rem", fontWeight: 600, marginBottom: "0.25rem" }}>
          Ang {ang}
        </h1>
        {shabad?.raag_english && (
          <p style={{ fontStyle: "italic", color: "var(--text-secondary)", fontFamily: '"Inter", sans-serif', fontSize: "0.9rem" }}>
            {shabad.raag_english}
          </p>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {lines.map((line) => {
          const lineShabad = (line as { shabads?: { writer_english?: string | null } | null }).shabads;
          return (
            <div key={line.id} className="card">
              <p className="gurmukhi-lg" style={{ marginBottom: "0.4rem" }}>
                {line.gurmukhi}
              </p>
              {line.transliteration_en && (
                <p style={{ fontStyle: "italic", color: "var(--text-secondary)", fontSize: "0.95rem", marginBottom: "0.35rem" }}>
                  {line.transliteration_en}
                </p>
              )}
              {line.translation_en && (
                <p style={{ color: "var(--text-secondary)", fontSize: "1rem" }}>
                  {line.translation_en}
                </p>
              )}
              {lineShabad?.writer_english && (
                <p style={{ fontFamily: '"Inter", sans-serif', fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "0.5rem" }}>
                  {lineShabad.writer_english}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
