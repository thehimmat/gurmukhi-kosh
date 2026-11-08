// The Google Slides export (#377): the pad-arth preview as a .pptx, which Google Slides imports
// (File → Import slides, or open the file from Drive). Same content rule as Copy as text
// (preview-text.ts): only chosen text; an unpicked row keeps its word and no gloss.
//
//   title         the scope ("ਜਪੁ, paragraph 4")
//   introduction  its own slide, before its line (086)
//   question      its own slide, before its line
//   line          the verse as the title, a row per word then per phrase, the line note
//
// slidePlan() is pure and holds the layout decisions; deckBuffer() only draws it.
//
// Every slide sits on a named layout (LAYOUTS) with title and body placeholders, and the look (font,
// size, alignment) lives on those layouts, not on the text. So a Google Slides theme with layouts of
// the same names restyles an import (Slide → Edit theme; import with "Keep original theme" off).
// The text keeps only what carries meaning: the word in bold, grammar in grey, notes in italics,
// and a smaller size when a long line has to shrink to fit. The layouts' own font is Noto Sans
// Gurmukhi, a Google Font, so Gurmukhi renders in Slides without a theme too.

import PptxGenJS from "pptxgenjs";
import type { PreviewLine, PreviewRow } from "./preview";

export type SlideRow = { surface: string; gloss: string | null; grammar: string | null; note: string | null };

export type PlannedSlide =
  | { kind: "title"; title: string }
  | { kind: "introduction"; text: string }
  | { kind: "question"; text: string }
  /** Sizes are null when the layout's own size fits; set only to shrink a long line. */
  | { kind: "line"; verse: string; verseSize: number | null; rows: SlideRow[]; note: string | null; fontSize: number | null };

/** The layout each kind of slide is built on: name a theme's layouts the same to style an import. */
export const LAYOUTS = {
  title: "Pad-arth title",
  line: "Pad-arth line",
  question: "Pad-arth question",
  introduction: "Pad-arth introduction",
} as const;

export const layoutFor = (s: PlannedSlide): string => LAYOUTS[s.kind];

const ROWS_SIZE = 28;
const VERSE_SIZE = 30;

const FONT = "Noto Sans Gurmukhi";

function slideRow(r: PreviewRow): SlideRow {
  const gloss = r.status === "picked" || r.status === "override" ? r.text : null;
  return { surface: r.surface, gloss, grammar: gloss && r.grammar.length ? r.grammar.join("; ") : null, note: r.note };
}

/** The verse's type size: a long verse still fits its title area, on two lines at most. */
function verseSizeFor(verse: string): number | null {
  if (verse.length > 70) return 20;
  if (verse.length > 45) return 24;
  return null;
}

/** Rows' type size: smaller as a line has more rows, so a long line still fits one slide. */
function fontSizeFor(rows: number): number | null {
  if (rows <= 7) return null;
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

function rowRuns(r: SlideRow, fontSize: number | null): Run[] {
  const base = fontSize === null ? {} : { fontSize };
  // A typed bullet: pptxgenjs's own bullet option starts a new paragraph at each run it's on, and
  // repeats paragraph settings per run, which breaks a row of mixed bold and italic text.
  const runs: Run[] = [{ text: `•  ${r.surface} =`, options: { ...base, bold: true } }];
  if (r.gloss) runs.push({ text: ` ${r.gloss}`, options: { ...base } });
  if (r.grammar) runs.push({ text: ` (${r.grammar})`, options: { ...base, color: "666666" } });
  if (r.note) runs.push({ text: ` ${r.note}`, options: { ...base, italic: true } });
  runs[runs.length - 1].options = { ...runs[runs.length - 1].options, breakLine: true };
  return runs;
}

const WIDE = { x: 0.5, w: 12.33 };

/** The four layouts, with the deck's default look on their placeholders. */
function defineLayouts(pptx: PptxGenJS): void {
  const ph = (name: string, type: "title" | "body", box: { x: number; y: number; w: number; h: number }, look: Record<string, unknown>) => ({
    placeholder: { options: { name, type, ...box, fontFace: FONT, ...look }, text: "" },
  });
  pptx.defineSlideMaster({
    title: LAYOUTS.title,
    objects: [ph("title", "title", { ...WIDE, y: 2.75, h: 2 }, { fontSize: 40, bold: true, align: "center", valign: "middle" })],
  });
  pptx.defineSlideMaster({
    title: LAYOUTS.line,
    objects: [
      ph("verse", "title", { ...WIDE, y: 0.25, h: 1.3 }, { fontSize: VERSE_SIZE, bold: true, align: "left", valign: "middle" }),
      ph("rows", "body", { x: 0.6, y: 1.7, w: 12.1, h: 5.5 }, { fontSize: ROWS_SIZE, align: "left", valign: "top", paraSpaceAfter: 4 }),
    ],
  });
  pptx.defineSlideMaster({
    title: LAYOUTS.question,
    objects: [ph("text", "body", { x: 1, y: 1, w: 11.33, h: 5.5 }, { fontSize: 28, align: "center", valign: "middle" })],
  });
  pptx.defineSlideMaster({
    title: LAYOUTS.introduction,
    objects: [ph("text", "body", { x: 1, y: 1, w: 11.33, h: 5.5 }, { fontSize: 28, italic: true, align: "center", valign: "middle" })],
  });
}

export function buildDeck(plan: PlannedSlide[]): PptxGenJS {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE"; // 13.33 × 7.5 in, Google Slides' 16:9
  defineLayouts(pptx);
  for (const s of plan) {
    const slide = pptx.addSlide({ masterName: layoutFor(s) });
    if (s.kind === "title") {
      slide.addText(s.title, { placeholder: "title" });
    } else if (s.kind === "introduction") {
      slide.addText(s.text, { placeholder: "text" });
    } else if (s.kind === "question") {
      slide.addText(
        [
          { text: "Question: ", options: { bold: true } },
          { text: s.text, options: {} },
        ],
        { placeholder: "text" }
      );
    } else {
      slide.addText(s.verse, { placeholder: "verse", ...(s.verseSize === null ? {} : { fontSize: s.verseSize }) });
      const runs = s.rows.flatMap((r) => rowRuns(r, s.fontSize));
      if (s.note) runs.push({ text: s.note, options: { ...(s.fontSize === null ? {} : { fontSize: s.fontSize }), italic: true, breakLine: true } });
      slide.addText(runs, { placeholder: "rows" });
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
