// Structured-layer rendering for one Mahan Kosh sense (#34 step 1).
//
// Deterministic templating over definitions.parsed + the decoded 1930 ਸੰਕੇਤ
// key: POS chips, origin lead-ins with the printed etymon, decoded grammar
// frames, ਦੇਖੋ cross-references as links, and decoded citations. No prose
// translation happens here.

import {
  type ParsedSense,
  posLabel,
  posTitle,
  originLabel,
  originTitle,
  formatGrammarFrame,
  formatCitations,
  nfdNormalize,
} from "@/lib/mahan-kosh-parsed";

const CHIP: React.CSSProperties = {
  fontFamily: '"Inter", sans-serif',
  fontSize: "0.75rem",
  fontWeight: 600,
  background: "var(--accent-bg, #f5ede6)",
  color: "var(--accent)",
  borderRadius: "4px",
  padding: "0.1rem 0.45rem",
};

const MUTED_CHIP: React.CSSProperties = {
  ...CHIP,
  fontWeight: 500,
  background: "#eceae6",
  color: "#5c574f",
};

export function ParsedSenseChips({
  parsed,
  linkableXrefs,
}: {
  parsed: ParsedSense;
  /** NFD-normalized Gurmukhi head-words that exist in `words` (linkable). */
  linkableXrefs: ReadonlySet<string>;
}) {
  const citations = formatCitations(parsed.citations);
  const hasChips = parsed.pos.length > 0 || parsed.language_origins.length > 0 || parsed.grammar.length > 0;
  if (!hasChips && parsed.xrefs.length === 0 && citations.length === 0) return null;

  return (
    <div style={{ marginTop: "0.5rem", display: "flex", flexDirection: "column", gap: "0.35rem" }}>
      {hasChips && (
        <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", alignItems: "center" }}>
          {parsed.pos.map((p, i) => (
            <span key={`pos-${i}`} title={posTitle(p)} style={CHIP}>
              {posLabel(p.pos)}
            </span>
          ))}
          {parsed.grammar.map((g, i) => (
            <span key={`gr-${i}`} title="Grammar frame printed in the entry, decoded via the Mahan Kosh key" style={CHIP}>
              {formatGrammarFrame(g)}
            </span>
          ))}
          {parsed.language_origins.map((o, i) => (
            <span key={`or-${i}`} title={originTitle(o)} style={MUTED_CHIP}>
              {originLabel(o)}
              {o.etymon && (
                <span
                  style={{
                    fontWeight: 400,
                    marginLeft: "0.3rem",
                    direction: o.etymon.script === "perso_arabic" ? "rtl" : undefined,
                    unicodeBidi: o.etymon.script === "perso_arabic" ? "isolate" : undefined,
                  }}
                >
                  {o.etymon.text}
                  {o.etymon.inferred ? "*" : ""}
                </span>
              )}
            </span>
          ))}
        </div>
      )}

      {parsed.xrefs.length > 0 && (
        <div style={{ fontFamily: '"Inter", sans-serif', fontSize: "0.82rem", color: "var(--text-secondary)" }}>
          See{" "}
          {parsed.xrefs.map((x, i) => {
            const label = x.sense_number != null ? `${x.target} (sense ${x.sense_number})` : x.target;
            const linkable = linkableXrefs.has(nfdNormalize(x.target));
            return (
              <span key={i}>
                {i > 0 && " · "}
                {linkable ? (
                  <a
                    href={`/word/${encodeURIComponent(x.target)}`}
                    className="gurmukhi"
                    style={{ color: "var(--accent)", textDecoration: "none" }}
                  >
                    {label}
                  </a>
                ) : (
                  <span className="gurmukhi">{label}</span>
                )}
              </span>
            );
          })}
        </div>
      )}

      {citations.length > 0 && (
        <div style={{ fontFamily: '"Inter", sans-serif', fontSize: "0.78rem", color: "var(--text-secondary)" }}>
          Cites:{" "}
          {citations.map((c, i) => (
            <span key={i} title={`Printed citation: (${c.raw})`}>
              {i > 0 && " · "}
              {c.text}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
