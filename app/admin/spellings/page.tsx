import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { submitSpellingReview } from "./actions";

export const dynamic = "force-dynamic";

type Row = {
  id: number;
  gurmukhi: string;
  roman_shackle: string | null;
  spelling_candidate: string | null;
  shackle_page: number | null;
  definitions: { definition_en: string | null; notes: string | null }[] | null;
  etymology: { source_text: string | null; root_form_roman: string | null }[] | null;
};

const CARD: React.CSSProperties = {
  border: "1px solid var(--border, #e4ddd0)",
  borderRadius: "10px",
  padding: "1.1rem 1.25rem",
  background: "var(--card, #fffdf9)",
  marginBottom: "1.1rem",
};
const LABEL: React.CSSProperties = {
  fontFamily: '"Inter", sans-serif',
  fontSize: "0.68rem",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  color: "var(--text-secondary)",
  display: "block",
  marginBottom: "0.15rem",
};

export default async function SpellingReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ key?: string }>;
}) {
  const { key } = await searchParams;
  if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY) {
    notFound();
  }

  const db = supabaseAdmin();
  const [{ data: queueData }, { count: reviewedCount }] = await Promise.all([
    db
      .from("words")
      .select("id, gurmukhi, roman_shackle, spelling_candidate, shackle_page, definitions(definition_en, notes), etymology(source_text, root_form_roman)")
      .not("spelling_candidate", "is", null)
      .is("spelling_reviewed_at", null)
      .order("shackle_page", { ascending: true }),
    db
      .from("words")
      .select("id", { count: "exact", head: true })
      .not("spelling_candidate", "is", null)
      .not("spelling_reviewed_at", "is", null),
  ]);
  const queue = (queueData ?? []) as unknown as Row[];

  return (
    <div style={{ maxWidth: "820px", margin: "0 auto", padding: "2.5rem 1.5rem", fontFamily: '"Inter", sans-serif' }}>
      <h1 style={{ fontFamily: '"Crimson Pro", Georgia, serif', fontSize: "1.9rem", margin: "0 0 0.3rem" }}>
        Shackle OCR spelling review
      </h1>
      <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", margin: "0 0 1.75rem", lineHeight: 1.55 }}>
        Off-corpus Shackle head-words whose OCRed Gurmukhi diverges from the reverse-transliteration of the
        romanized head-word. The romanized head-word is the ground truth to transliterate from (though it too
        was OCRed). {queue.length} to review · {reviewedCount ?? 0} done.
      </p>

      {queue.length === 0 && (
        <div style={{ ...CARD, textAlign: "center", color: "var(--text-secondary)" }}>
          All caught up — nothing left in the queue.
        </div>
      )}

      {queue.map((w) => {
        const gloss = (w.definitions ?? []).map((d) => d.definition_en).filter(Boolean).join(" | ");
        const etym = (w.etymology ?? []).map((e) => e.source_text || e.root_form_roman).filter(Boolean).join(" · ");
        return (
          <div key={w.id} style={CARD}>
            <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap", alignItems: "baseline", marginBottom: "0.8rem" }}>
              <div>
                <span style={LABEL}>Printed (OCR)</span>
                <span className="gurmukhi" style={{ fontSize: "2rem", lineHeight: 1 }}>{w.gurmukhi}</span>
              </div>
              <div>
                <span style={LABEL}>Roman head-word</span>
                <span style={{ fontSize: "1.15rem", fontStyle: "italic" }}>{w.roman_shackle ?? "—"}</span>
              </div>
              <div>
                <span style={LABEL}>Transliterator hint</span>
                <span className="gurmukhi" style={{ fontSize: "1.4rem", color: "var(--accent)" }}>{w.spelling_candidate}</span>
              </div>
              {w.shackle_page != null && (
                <div>
                  <span style={LABEL}>Book page</span>
                  <span style={{ fontSize: "1.05rem" }}>p. {w.shackle_page}</span>
                </div>
              )}
            </div>

            {gloss && (
              <div style={{ marginBottom: "0.5rem" }}>
                <span style={LABEL}>Meaning</span>
                <span style={{ fontFamily: '"Crimson Pro", Georgia, serif', fontSize: "1.02rem" }}>{gloss}</span>
              </div>
            )}
            {etym && (
              <div style={{ marginBottom: "0.5rem" }}>
                <span style={LABEL}>Etymology</span>
                <span style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>{etym}</span>
              </div>
            )}
            <a
              href={`/word/${encodeURIComponent(w.gurmukhi)}`}
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: "0.8rem", color: "var(--accent)" }}
            >
              open word page ↗
            </a>

            <form action={submitSpellingReview} style={{ marginTop: "0.9rem", display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
              <input type="hidden" name="key" value={key} />
              <input type="hidden" name="wordId" value={w.id} />
              <label style={{ ...LABEL, marginBottom: 0 }}>Corrected spelling</label>
              <input
                name="corrected"
                defaultValue={w.gurmukhi}
                className="gurmukhi"
                style={{ fontSize: "1.3rem", padding: "0.3rem 0.6rem", border: "1px solid var(--border,#d8cfbe)", borderRadius: "6px", minWidth: "9rem" }}
              />
              <input
                name="note"
                placeholder="note (optional)"
                style={{ fontSize: "0.85rem", padding: "0.4rem 0.6rem", border: "1px solid var(--border,#d8cfbe)", borderRadius: "6px", flex: "1 1 8rem" }}
              />
              <button
                type="submit"
                name="decision"
                value="correct"
                style={{ fontSize: "0.85rem", padding: "0.45rem 0.9rem", background: "var(--accent)", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer" }}
              >
                Save correction
              </button>
              <button
                type="submit"
                name="decision"
                value="keep"
                style={{ fontSize: "0.85rem", padding: "0.45rem 0.9rem", background: "transparent", color: "var(--text-secondary)", border: "1px solid var(--border,#d8cfbe)", borderRadius: "6px", cursor: "pointer" }}
              >
                Printed is correct
              </button>
            </form>
          </div>
        );
      })}
    </div>
  );
}
