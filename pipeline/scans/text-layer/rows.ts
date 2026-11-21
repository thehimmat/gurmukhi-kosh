import { parseUnit, type ScanPage } from "./read";
import { matchUnitLines } from "./match";

/** Where a page's image sits under the server's scan image root (render-pages script). */
export const imagePath = (slug: string, page: number) => `${slug}/${String(page).padStart(4, "0")}.webp`;

export type BuildInput = {
  slug: string;
  title: string;
  sourceNote?: string | null;
  pages: ScanPage[];
  units: Record<string, unknown>[];
};

/** Rows for migration 093's tables, ready to insert in this order. */
export function buildRows({ slug, title, sourceNote = null, pages, units }: BuildInput) {
  const byPage = new Map(pages.map((p) => [p.page, p]));
  const parsed = units.map((u, i) => parseUnit(u, i + 1));
  for (const u of parsed) {
    const missing = u.pages.filter((p) => !byPage.has(p));
    if (missing.length) throw new Error(`unit ${u.seq} (${u.label}) names page ${missing.join(", ")}, which has no transcription`);
  }
  return {
    text: { slug, title, source_note: sourceNote },
    pages: pages.map((p) => ({ text_slug: slug, page: p.page, image_path: imagePath(slug, p.page), width: null, height: null })),
    lines: pages.flatMap((p) => p.lines.map((l) => ({ text_slug: slug, page: p.page, n: l.n, type: l.type, text: l.text, bbox: null }))),
    units: parsed.map(({ seq, label, pages, source, translation, literal, context, nuances, doubts, terms, gurbani }) => ({
      text_slug: slug, seq, label, pages, source, translation, literal, context, nuances, doubts, terms, gurbani,
    })),
    unitLines: parsed.flatMap((u) => matchUnitLines(u, byPage).map((r) => ({ text_slug: slug, seq: u.seq, ...r }))),
  };
}
