// The pad-arth preview (#23): the saved picks in the shape of the maintainer's Japji document.
// Rows not yet picked show their top gloss, greyed and labelled, so gaps are easy to spot.

import type { PreviewLine, PreviewRow } from "@/lib/padarth/preview";
import { previewText } from "@/lib/padarth/preview-text";
import { CopyText } from "./CopyText";

function Row({ r }: { r: PreviewRow }) {
  const unpicked = r.status === "draft" || r.status === "uncovered";
  return (
    <li className={unpicked ? "padarth-preview-row padarth-preview-draft" : "padarth-preview-row"}>
      <span className="gurmukhi">{r.surface}</span> = {r.text ?? "—"}
      {r.grammar.length > 0 && ` (${r.grammar.join("; ")})`}
      {unpicked && <span className="padarth-caveat"> unpicked</span>}
      {r.note && (
        <>
          {" "}
          <em>{r.note}</em>
        </>
      )}
    </li>
  );
}

export function PadarthPreview({ lines }: { lines: PreviewLine[] }) {
  const all = lines.flatMap((l) => [...l.rows, ...l.phrases]);
  const unpicked = all.filter((r) => r.status === "draft" || r.status === "uncovered").length;
  return (
    <div className="padarth-preview">
      <p className="padarth-help">
        {unpicked} of {all.length} rows not yet picked.
      </p>
      <CopyText text={previewText(lines)} />
      {lines.map((l) => (
        <section key={l.lineId} className="padarth-preview-line">
          {l.introduction && (
            <p className="padarth-preview-commentary">
              <em>{l.introduction}</em>
            </p>
          )}
          {l.question && (
            <p className="padarth-preview-commentary">
              <em>Question:</em> {l.question}
            </p>
          )}
          <p className="gurmukhi-lg">
            <strong>{l.gurmukhi}</strong>
          </p>
          <ul>
            {l.rows.map((r, i) => (
              <Row key={`w${i}`} r={r} />
            ))}
            {l.phrases.map((r, i) => (
              <Row key={`p${i}`} r={r} />
            ))}
            {l.note && (
              <li className="padarth-preview-row">
                <em>{l.note}</em>
              </li>
            )}
          </ul>
        </section>
      ))}
    </div>
  );
}
