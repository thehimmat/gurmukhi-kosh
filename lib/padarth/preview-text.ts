// "Copy as text" (#23): the preview (lib/padarth/preview.ts) as Markdown-flavoured plain text in the
// Japji document's shape, for pasting into slides until a slide app is chosen.
//   **verse**            the line, bold
//   - ਸ਼ਬਦ = gloss        one bullet per word, then the phrases; grammar in brackets, a note in italics
//   *line note*          after the bullets
// Only chosen text is copied: an unpicked or uncovered row keeps its bullet with nothing after "=",
// so the gap shows where it is to be filled.

import type { PreviewLine, PreviewRow } from "./preview";

function bullet(r: PreviewRow): string {
  const chosen = r.status === "picked" || r.status === "override" ? r.text : null;
  const parts = [`- ${r.surface} =`];
  if (chosen) parts.push(chosen);
  if (chosen && r.grammar.length) parts.push(`(${r.grammar.join("; ")})`);
  if (r.note) parts.push(`*${r.note}*`);
  return parts.join(" ");
}

export function previewText(lines: PreviewLine[]): string {
  return lines
    .map((l) => {
      const out = [`**${l.gurmukhi}**`, ""];
      out.push(...[...l.rows, ...l.phrases].map(bullet));
      if (l.note) out.push("", `*${l.note}*`);
      return out.join("\n") + "\n";
    })
    .join("\n");
}
