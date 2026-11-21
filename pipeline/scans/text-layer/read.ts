/**
 * Read thehimmat/scan-text-layer's output for one text: the page transcriptions
 * (out/<slug>/pages/NNNN.json, or final/ for manuscripts) and the translation units
 * (translations/<slug>.jsonl). See migration 093 for the tables they load into.
 */

/** Line types migration 093 accepts (scan_lines.type). */
export const LINE_TYPES = ["body", "gurbani", "heading", "running-head", "pagenum", "footnote", "margin", "rubric", "catchword"] as const;
export type LineType = (typeof LINE_TYPES)[number];

export type ScanLine = { n: number; type: LineType; text: string };
export type ScanPage = { page: number; lines: ScanLine[] };

export type ScanUnit = {
  seq: number;
  label: string;
  pages: number[];
  source: string;
  translation: string;
  literal: string | null;
  context: string | null;
  nuances: unknown[];
  doubts: unknown[];
  terms: unknown[];
  gurbani: unknown[];
};

type RawPage = { page: number; lines: { n: number; type: string; text: string }[] };

export function parsePage(raw: RawPage): ScanPage {
  return {
    page: raw.page,
    lines: raw.lines.map((l) => {
      if (!(LINE_TYPES as readonly string[]).includes(l.type)) {
        throw new Error(`page ${raw.page} line ${l.n}: line type "${l.type}" is not one of ${LINE_TYPES.join(", ")} (migration 093)`);
      }
      return { n: l.n, type: l.type as LineType, text: l.text };
    }),
  };
}

const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const textOrNull = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

/** One line of translations/<slug>.jsonl; `seq` is its place in the file, from 1. */
export function parseUnit(raw: Record<string, unknown>, seq: number): ScanUnit {
  return {
    seq,
    label: String(raw.unit ?? `unit ${seq}`),
    pages: list(raw.pages).map(Number),
    source: String(raw.source ?? ""),
    translation: String(raw.translation ?? ""),
    literal: textOrNull(raw.literal),
    context: textOrNull(raw.context),
    nuances: list(raw.nuances),
    doubts: list(raw.doubts),
    terms: list(raw.terms),
    gurbani: list(raw.gurbani),
  };
}
