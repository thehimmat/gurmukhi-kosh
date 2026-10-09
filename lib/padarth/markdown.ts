// Render an assembled pad-arth passage as Markdown, for copying out to notes
// or to an AI. One block per line: the line, its translations, then each word
// with its glosses, phrases after the last word they cover, and any pad-arth
// that could not be placed.

import type { GlossGroup, PadarthGloss, PadarthPassage, PassageLine, Sense } from "./assemble";

export const DEFAULT_SOURCE_LABELS: Record<string, string> = {
  mahan_kosh: "Mahan Kosh",
  shackle: "Shackle",
  sikhri: "SikhRI",
  manual: "Manual",
  manmohan_en: "Manmohan Singh (English)",
  manmohan_pa: "Manmohan Singh (Punjabi)",
  ss_darpan: "Sahib Singh, Darpan",
  ss_padarth: "Sahib Singh, pad-arth",
  faridkot: "Faridkot Teeka",
};

function senseText(s: Sense): string {
  return s.textEn && s.textEn !== s.text ? `${s.text} (${s.textEn})` : s.text;
}

function sensesText(senses: Sense[]): string {
  if (senses.length === 1) return senseText(senses[0]);
  return senses.map((s) => `${s.senseNumber}. ${senseText(s)}`).join("; ");
}

export function passageToMarkdown(passage: PadarthPassage, labels: Record<string, string> = {}): string {
  const label = (code: string) => labels[code] ?? DEFAULT_SOURCE_LABELS[code] ?? code;
  const lineText = new Map(passage.lines.map((l) => [l.lineId, l.gurmukhi]));

  const padarthLines = (items: PadarthGloss[]): string[] =>
    items.flatMap((p) => {
      const from = p.borrowedFromLineId === null ? "" : ` (filed under ${lineText.get(p.borrowedFromLineId) ?? p.borrowedFromLineId})`;
      return [`- Pad-arth${from}: ${p.gloss}`, ...p.notes.map((n) => `  - Note: ${n}`)];
    });

  const glossLines = (groups: GlossGroup[]): string[] =>
    groups.map((g) => {
      const via = g.via ? `, via ${g.via.base} (${g.via.basis})` : "";
      return `- ${label(g.source)}${via}: ${sensesText(g.senses)}`;
    });

  function renderLine(l: PassageLine): string {
    const out: string[] = [`### ${l.gurmukhi}`, `Ang ${l.ang}, line ${l.lineNo}`];

    if (l.translations.length > 0) {
      out.push("", ...l.translations.map((t) => `- ${label(t.sourceCode)}: ${t.body}`));
    }

    const phraseFor = (at: number) => l.phrases.find((p) => p.positions.includes(at));
    l.words.forEach((w, at) => {
      const body = [
        ...padarthLines(w.padarth),
        ...glossLines(w.glosses),
        ...w.grammar.map((g) => {
          const values = [g.pos, g.gender, g.number, g.gramCase].filter(Boolean).join(", ");
          return `- Grammar${g.sourceCode ? ` (${label(g.sourceCode)})` : ""}: ${values}`;
        }),
      ];
      if (body.length > 0) out.push("", `**${w.gurmukhi}**`, ...body);
      else if (phraseFor(at)) out.push("", `**${w.gurmukhi}** — in phrase ${phraseFor(at)!.text}`);
      else out.push("", `**${w.gurmukhi}** — no gloss found`);

      for (const p of l.phrases.filter((p) => p.positions[p.positions.length - 1] === at)) {
        out.push("", `**${p.text}** (phrase)`, ...padarthLines(p.padarth), ...glossLines(p.glosses));
      }
    });

    if (l.padarthLeading.length > 0) {
      out.push("", "Pad-arth notes:", ...l.padarthLeading.map((n) => `- ${n}`));
    }
    if (l.padarthUnplaced.length > 0) {
      out.push("", "Pad-arth not placed on a word:", ...l.padarthUnplaced.map((e) => `- ${e.term} = ${e.gloss}`));
    }
    return out.join("\n") + "\n";
  }

  return passage.lines.map(renderLine).join("\n---\n\n");
}
