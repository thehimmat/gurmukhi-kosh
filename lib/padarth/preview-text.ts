// "Copy as text" (#23): the preview (lib/padarth/preview.ts) as Markdown-flavoured plain text in the
// Japji document's shape, for pasting into slides until a slide app is chosen.
//   *introduction*       before the line, if one is set (086)
//   *Question:* text     before the line, if one is set
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
      const out: string[] = [];
      if (l.introduction) out.push(`*${l.introduction}*`, "");
      if (l.question) out.push(`*Question:* ${l.question}`, "");
      out.push(`**${l.gurmukhi}**`, "");
      out.push(...[...l.rows, ...l.phrases].map(bullet));
      if (l.note) out.push("", `*${l.note}*`);
      return out.join("\n") + "\n";
    })
    .join("\n");
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The same content as previewText, as HTML: pasted into Google Slides it keeps bold, italics and bullets. */
export function previewHtml(lines: PreviewLine[]): string {
  return lines
    .map((l) => {
      let out = "";
      if (l.introduction) out += `<p><i>${esc(l.introduction)}</i></p>`;
      if (l.question) out += `<p><b>Question:</b> ${esc(l.question)}</p>`;
      out += `<p><b>${esc(l.gurmukhi)}</b></p><ul>`;
      for (const r of [...l.rows, ...l.phrases]) {
        const chosen = r.status === "picked" || r.status === "override" ? r.text : null;
        let item = `<b>${esc(r.surface)}</b> =`;
        if (chosen) item += ` ${esc(chosen)}`;
        if (chosen && r.grammar.length) item += ` (${esc(r.grammar.join("; "))})`;
        if (r.note) item += ` <i>${esc(r.note)}</i>`;
        out += `<li>${item}</li>`;
      }
      out += "</ul>";
      if (l.note) out += `<p><i>${esc(l.note)}</i></p>`;
      return out;
    })
    .join("");
}
