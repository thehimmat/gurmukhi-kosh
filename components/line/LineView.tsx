import {
  GRID_ID, VIEWS, defaultSources, gridAttributes, lineParts, placeLabel, sourceLabel,
  type LineContext, type PickerState, type ViewId,
} from "@/lib/line-context";
import { ResourcePicker } from "./ResourcePicker";

// The Gurbani viewer (#146): a split view, Gurbani on the left and the chosen
// resources on the right, one row per line so each line sits level with its
// translations or commentaries. On a narrow screen a row stacks, resources
// under their line. Scope is the shabad or the whole ang; the line opened
// from a link (#line-<id>) is marked.

const META: React.CSSProperties = { fontFamily: '"Inter", sans-serif', fontSize: "0.85rem", color: "var(--text-secondary)" };
const NAV: React.CSSProperties = { fontFamily: '"Inter", sans-serif', fontSize: "0.875rem", color: "var(--accent)" };

const scopePath = (id: number, scope: LineContext["scope"]) => (scope === "ang" ? `/line/${id}/ang` : `/line/${id}`);

export function LineView({ ctx }: { ctx: LineContext }) {
  const first = ctx.lines[0];
  const code = ctx.source?.code ?? null;
  const sggs = code === "sggs_banidb_v2";
  const angs = [...new Set(ctx.lines.map((l) => l.ang))];
  const place = angs.length > 1 ? `${placeLabel(code, angs[0])}–${angs.at(-1)}` : placeLabel(code, first?.ang ?? 0);

  const present = new Set(ctx.sources.map((s) => s.code));
  const initial: PickerState = {
    view: VIEWS.find((v) => v.sources.some((s) => present.has(s)))?.id ?? "translation",
    on: Object.fromEntries(VIEWS.map((v) => [v.id, defaultSources(v.id, present)])) as Record<ViewId, string[]>,
  };
  // A source shows when the grid carries data-on-<code>; the picker sets them.
  const css = ctx.sources
    .map((s) => `#${GRID_ID}[data-on-${s.code}="1"] .viewer-res[data-src="${s.code}"]{display:block}`)
    .join("");
  const sourceByCode = new Map(ctx.sources.map((s) => [s.code, s]));

  // In an ang view, each shabad the ang holds gets its own small heading.
  const headingFor = (i: number) => {
    if (ctx.scope !== "ang" || !sggs) return null;
    const cur = ctx.lines[i];
    const prev = ctx.lines[i - 1];
    if (prev && prev.shabad_id === cur.shabad_id) return null;
    const s = cur.shabads;
    if (!s?.raag_gurmukhi && !s?.writer_english) return null;
    return (
      <div className="viewer-shabad-head">
        {s?.raag_gurmukhi && <span className="gurmukhi">{s.raag_gurmukhi}</span>}
        {s?.raag_english && <span> ({s.raag_english})</span>}
        {s?.writer_english && <span> · {s.writer_english}</span>}
      </div>
    );
  };

  const target = `#line-${ctx.lineId}`;
  const nav = (
    <nav style={{ display: "flex", gap: "1rem", alignItems: "baseline" }}>
      {ctx.prevId != null && <a href={scopePath(ctx.prevId, ctx.scope)} style={NAV}>← Previous {ctx.scope}</a>}
      <a href="/" style={{ ...NAV, color: "var(--text-secondary)", textDecoration: "none" }}>search</a>
      {ctx.nextId != null && <a href={scopePath(ctx.nextId, ctx.scope)} style={{ ...NAV, marginLeft: "auto" }}>Next {ctx.scope} →</a>}
    </nav>
  );

  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "2rem 1.5rem 4rem" }}>
      {nav}

      <header style={{ margin: "1.5rem 0 1rem", display: "flex", flexWrap: "wrap", gap: "0.25rem 1.25rem", alignItems: "baseline" }}>
        <span style={{ ...META, fontWeight: 600, color: "var(--text-primary)" }}>{ctx.source?.name ?? "Gurbani"}</span>
        {sggs && angs.length === 1 && ctx.scope === "shabad"
          ? <a href={`/line/${ctx.lineId}/ang${target}`} style={META}>{place}</a>
          : <span style={META}>{place}</span>}
        {ctx.scope === "shabad" && ctx.shabad?.raag_gurmukhi && (
          <span style={META}>
            <span className="gurmukhi">{ctx.shabad.raag_gurmukhi}</span>
            {ctx.shabad.raag_english ? ` (${ctx.shabad.raag_english})` : ""}
          </span>
        )}
        {ctx.scope === "shabad" && ctx.shabad?.writer_english && <span style={META}>{ctx.shabad.writer_english}</span>}

        <span role="group" aria-label="Scope" style={{ marginLeft: "auto", display: "inline-flex", border: "1px solid var(--border)", borderRadius: "6px", overflow: "hidden", fontFamily: '"Inter", sans-serif', fontSize: "0.8rem" }}>
          {(["shabad", "ang"] as const).map((s) => (
            <a
              key={s}
              href={`${scopePath(ctx.lineId, s)}${target}`}
              aria-current={ctx.scope === s ? "page" : undefined}
              style={{
                padding: "0.25rem 0.8rem", textDecoration: "none",
                background: ctx.scope === s ? "var(--accent)" : "white",
                color: ctx.scope === s ? "white" : "var(--text-secondary)",
              }}
            >{s === "shabad" ? "Shabad" : "Ang"}</a>
          ))}
        </span>
      </header>

      <div className="viewer-row viewer-controls">
        <div />
        <ResourcePicker sources={ctx.sources} initial={initial} />
      </div>
      <style>{css}</style>

      <div id={GRID_ID} {...gridAttributes(initial)}>
        {ctx.lines.map((line, i) => (
          <div key={line.id}>
            {headingFor(i)}
            <div id={`line-${line.id}`} className="viewer-row viewer-line">
              <div>
                <p className="gurmukhi-lg" style={{ marginBottom: "0.15rem" }}>
                  {lineParts(line.gurmukhi).map((part, j) =>
                    part.word
                      ? <a key={j} className="viewer-word" href={`/word/${encodeURIComponent(part.word)}`}>{part.text}</a>
                      : <span key={j}>{part.text}</span>,
                  )}
                </p>
                {line.transliteration_en && (
                  <p style={{ fontStyle: "italic", color: "var(--text-secondary)", fontSize: "0.9rem" }}>{line.transliteration_en}</p>
                )}
              </div>
              <div>
                {(ctx.resources.get(line.id) ?? []).map((r) => {
                  const src = sourceByCode.get(r.source_code);
                  return (
                    <div key={r.source_code} className="viewer-res" data-src={r.source_code}>
                      <p className={r.language === "pa" ? "gurmukhi" : undefined} style={{ fontSize: r.language === "pa" ? "1.05rem" : "1rem" }}>
                        {r.body_unicode}
                      </p>
                      <p className="viewer-res-source">
                        {src ? sourceLabel(src) : r.source_code}
                        {r.caveat && <> · <em>{r.caveat}</em></>}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: "2.5rem" }}>{nav}</div>
    </div>
  );
}
