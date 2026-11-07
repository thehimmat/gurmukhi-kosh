// The Google Slides export (#377): the pad-arth preview as a .pptx, which Google Slides imports
// (File → Import slides, or open the file from Drive). Same content rule as Copy as text
// (preview-text.ts): only chosen text; an unpicked row keeps its word and no gloss.
//
//   title         the scope ("ਜਪੁ, paragraph 4")
//   introduction  its own slide, before its line (086)
//   question      its own slide, before its line
//   line          the verse as the title, a row per word then per phrase, the line note
//
// slidePlan() is pure and holds the layout decisions; deckBuffer() only draws it. Text is set in
// Noto Sans Gurmukhi, a Google Font, so Gurmukhi renders in Slides without anything installed.

import PptxGenJS from "pptxgenjs";
import type { PreviewLine, PreviewRow } from "./preview";

export type SlideRow = { surface: string; gloss: string | null; grammar: string | null; note: string | null };

export type PlannedSlide =
  | { kind: "title"; title: string }
  | { kind: "introduction"; text: string }
  | { kind: "question"; text: string }
  | { kind: "line"; verse: string; verseSize: number; rows: SlideRow[]; note: string | null; fontSize: number };

const FONT = "Noto Sans Gurmukhi";

function slideRow(r: PreviewRow): SlideRow {
  const gloss = r.status === "picked" || r.status === "override" ? r.text : null;
  return { surface: r.surface, gloss, grammar: gloss && r.grammar.length ? r.grammar.join("; ") : null, note: r.note };
}

/** The verse's type size: a long verse still fits its title area, on two lines at most. */
function verseSizeFor(verse: string): number {
  if (verse.length > 70) return 20;
  if (verse.length > 45) return 24;
  return 30;
}

/** Rows' type size: smaller as a line has more rows, so a long line still fits one slide. */
function fontSizeFor(rows: number): number {
  if (rows <= 7) return 28;
  if (rows <= 10) return 24;
  if (rows <= 13) return 20;
  if (rows <= 17) return 16;
  return 13;
}

export function slidePlan(lines: PreviewLine[], title: string): PlannedSlide[] {
  const out: PlannedSlide[] = [{ kind: "title", title }];
  for (const l of lines) {
    if (l.introduction) out.push({ kind: "introduction", text: l.introduction });
    if (l.question) out.push({ kind: "question", text: l.question });
    const rows = [...l.rows, ...l.phrases].map(slideRow);
    out.push({
      kind: "line",
      verse: l.gurmukhi,
      verseSize: verseSizeFor(l.gurmukhi),
      rows,
      note: l.note,
      fontSize: fontSizeFor(rows.length + (l.note ? 1 : 0)),
    });
  }
  return out;
}

type Run = PptxGenJS.TextProps;

function rowRuns(r: SlideRow, fontSize: number): Run[] {
  const base = { fontFace: FONT, fontSize };
  // A typed bullet: pptxgenjs's own bullet option starts a new paragraph at each run it's on, and
  // repeats paragraph settings per run, which breaks a row of mixed bold and italic text.
  const runs: Run[] = [{ text: `•  ${r.surface} =`, options: { ...base, bold: true } }];
  if (r.gloss) runs.push({ text: ` ${r.gloss}`, options: base });
  if (r.grammar) runs.push({ text: ` (${r.grammar})`, options: { ...base, color: "666666" } });
  if (r.note) runs.push({ text: ` ${r.note}`, options: { ...base, italic: true } });
  runs[runs.length - 1].options = { ...runs[runs.length - 1].options, breakLine: true };
  return runs;
}

export function buildDeck(plan: PlannedSlide[]): PptxGenJS {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE"; // 13.33 × 7.5 in, Google Slides' 16:9
  for (const s of plan) {
    const slide = pptx.addSlide();
    if (s.kind === "title") {
      slide.addText(s.title, { x: 0.5, y: 2.75, w: 12.33, h: 2, fontFace: FONT, fontSize: 40, bold: true, align: "center", valign: "middle" });
    } else if (s.kind === "introduction") {
      slide.addText(s.text, { x: 1, y: 1, w: 11.33, h: 5.5, fontFace: FONT, fontSize: 28, italic: true, align: "center", valign: "middle" });
    } else if (s.kind === "question") {
      slide.addText(
        [
          { text: "Question: ", options: { bold: true } },
          { text: s.text, options: {} },
        ],
        { x: 1, y: 1, w: 11.33, h: 5.5, fontFace: FONT, fontSize: 28, align: "center", valign: "middle" }
      );
    } else {
      slide.addText(s.verse, { x: 0.5, y: 0.25, w: 12.33, h: 1.3, fontFace: FONT, fontSize: s.verseSize, bold: true, valign: "middle" });
      const runs = s.rows.flatMap((r) => rowRuns(r, s.fontSize));
      if (s.note) runs.push({ text: s.note, options: { fontFace: FONT, fontSize: s.fontSize, italic: true, breakLine: true } });
      slide.addText(runs, { x: 0.6, y: 1.7, w: 12.1, h: 5.5, valign: "top", paraSpaceAfter: 4 });
    }
  }
  return pptx;
}

/** The deck as .pptx bytes. */
export async function deckBuffer(lines: PreviewLine[], title: string): Promise<Buffer> {
  const out = await buildDeck(slidePlan(lines, title)).write({ outputType: "nodebuffer" });
  return out as Buffer;
}

/** A plain-ASCII file name for a deck: "padarth-bani-2-paragraph-4.pptx". */
export function deckFileName(scopeQuery: string): string {
  const slug = scopeQuery
    .replace(/(^|&)(bani|p|ang|shabad|source)=/g, (_, amp, k) => `${amp ? "-" : ""}${k === "p" ? "paragraph" : k}-`)
    .replace(/[^a-z0-9-]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return `padarth-${slug || "scope"}.pptx`;
}
