import { METHOD_HELP, type DictEntryGroup } from "@/lib/dict-entry-view";

// The curator's Dictionaries tab: every dictionary entry linked to the word, by dictionary. The
// links are automatic and unreviewed (curator-only, 089/092), so each entry says how it matched.

const UI = { fontFamily: '"Inter", sans-serif' } as const;
const LONG = 360;

const METHOD_STYLE: Record<string, React.CSSProperties> = {
  exact: { background: "var(--accent-light)", color: "var(--accent)" },
  manual: { background: "var(--accent-light)", color: "var(--accent)" },
  fold: { background: "var(--accent-light)", color: "var(--accent)", opacity: 0.85 },
  loose: { background: "transparent", color: "var(--text-secondary)", border: "1px solid var(--border)" },
  stem: { background: "transparent", color: "var(--text-secondary)", border: "1px dashed var(--border)" },
};

function Gloss({ text }: { text: string }) {
  const style: React.CSSProperties = { margin: "0.35rem 0 0", lineHeight: 1.6, whiteSpace: "pre-line", overflowWrap: "anywhere" };
  if (text.length <= LONG) return <p style={style}>{text}</p>;
  return (
    <details>
      <summary style={{ ...style, cursor: "pointer", listStyle: "none" }}>
        {text.slice(0, LONG).trimEnd()}… <span style={{ ...UI, fontSize: "0.8rem", color: "var(--accent)" }}>more</span>
      </summary>
      <p style={style}>{text}</p>
    </details>
  );
}

export function DictionaryEntries({ groups }: { groups: DictEntryGroup[] }) {
  if (groups.length === 0) {
    return (
      <p style={{ ...UI, fontSize: "0.9rem", color: "var(--text-secondary)" }}>
        No dictionary entry is linked to this word yet.
      </p>
    );
  }
  const total = groups.reduce((n, g) => n + g.entries.length + g.hidden, 0);
  return (
    <div>
      <p style={{ ...UI, fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: "1.25rem", maxWidth: "44rem" }}>
        {total} {total === 1 ? "entry" : "entries"} from {groups.length} {groups.length === 1 ? "dictionary" : "dictionaries"}, linked
        automatically and not reviewed. Loose and stem matches are guesses for research; hover a label for how it matched.
      </p>
      {groups.map((g) => (
        <section key={g.code} style={{ marginBottom: "1.75rem" }}>
          <h3 style={{ ...UI, fontSize: "0.95rem", fontWeight: 600, margin: "0 0 0.6rem" }}>
            {g.name}
            <span style={{ fontWeight: 400, fontSize: "0.8rem", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
              {" · "}{g.entries.length + g.hidden}
            </span>
          </h3>
          <ol style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {g.entries.map((e) => (
              <li key={e.ref} className="card" style={{ marginBottom: "0.6rem", padding: "0.85rem 1rem" }}>
                <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", alignItems: "baseline" }}>
                  <span
                    lang={e.script === "devanagari" ? "sa" : e.script === "gurmukhi" ? "pa" : undefined}
                    className={e.script === "gurmukhi" ? "gurmukhi" : undefined}
                    style={{ fontSize: "1.2rem", fontFamily: e.script === "devanagari" ? '"Noto Sans Devanagari", "Noto Sans Gurmukhi", serif' : undefined }}
                  >
                    {e.headword}
                  </span>
                  {e.iast && <span style={{ fontStyle: "italic", color: "var(--text-secondary)" }}>{e.iast}</span>}
                  <span className="badge" title={METHOD_HELP[e.method]} style={{ ...METHOD_STYLE[e.method], marginLeft: "auto" }}>
                    {e.methodLabel}
                  </span>
                </div>
                <Gloss text={e.gloss} />
                {(e.page || e.url) && (
                  <div style={{ ...UI, fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.4rem" }}>
                    {e.page && <>p. {e.page}</>}
                    {e.page && e.url && " · "}
                    {e.url && (
                      <a href={e.url} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>
                        source
                      </a>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ol>
          {g.hidden > 0 && (
            <p style={{ ...UI, fontSize: "0.8rem", color: "var(--text-secondary)" }}>
              and {g.hidden} more loosely matched {g.hidden === 1 ? "entry" : "entries"} not shown.
            </p>
          )}
        </section>
      ))}
    </div>
  );
}
