import type { SupabaseClient } from "@supabase/supabase-js";

// The curator's scan viewer (/admin/scans, migration 093): a page image, its transcription and the
// translation units on it, each pane switchable.

export type Pane = "image" | "text" | "translation";
export type Show = Record<Pane, boolean>;
export const PANES: Pane[] = ["image", "text", "translation"];
export const DEFAULT_SHOW: Show = { image: true, text: true, translation: true };

/** ?show=image,text → which panes are on. Never all off: that falls back to all on. */
export function parseShow(param: string | undefined | null): Show {
  if (param == null) return DEFAULT_SHOW;
  const names = param.split(",").map((s) => s.trim());
  const show = Object.fromEntries(PANES.map((p) => [p, names.includes(p)])) as Show;
  return PANES.some((p) => show[p]) ? show : DEFAULT_SHOW;
}

export const showParam = (show: Show) => PANES.filter((p) => show[p]).join(",");

export type ScanLineRow = { n: number; type: string; text: string; bbox: number[] | null };
export type ScanUnitRow = {
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
export type ScanPageRows = {
  text: { slug: string; title: string };
  page: { page: number; image_path: string | null; width: number | null; height: number | null };
  pageNumbers: number[];
  lines: ScanLineRow[];
  units: ScanUnitRow[];
  unitLines: { seq: number; page: number; n: number }[];
};

export type ScanPageView = ReturnType<typeof shapeScanPage>;

export function shapeScanPage(rows: ScanPageRows) {
  const here = rows.page.page;
  const onPage = rows.unitLines.filter((l) => l.page === here);
  const at = rows.pageNumbers.indexOf(here);
  return {
    text: rows.text,
    page: rows.page,
    prev: at > 0 ? rows.pageNumbers[at - 1] : null,
    next: at >= 0 && at < rows.pageNumbers.length - 1 ? rows.pageNumbers[at + 1] : null,
    pageCount: rows.pageNumbers.length,
    lines: rows.lines.map((l) => ({ ...l, units: onPage.filter((u) => u.n === l.n).map((u) => u.seq).sort((a, b) => a - b) })),
    units: [...rows.units]
      .sort((a, b) => a.seq - b.seq)
      .map((u) => ({
        ...u,
        continued: Math.min(...u.pages) < here,
        lines: onPage.filter((l) => l.seq === u.seq).map((l) => l.n).sort((a, b) => a - b),
      })),
  };
}

// ── reads (service role only: these tables have no API-role grants) ─────────────────────────

export async function fetchScanTexts(db: SupabaseClient) {
  const { data, error } = await db.from("scan_texts").select("slug, title, scan_pages(count), scan_units(count)").order("title");
  if (error) throw new Error(error.message);
  return (data ?? []).map((t) => ({
    slug: t.slug as string,
    title: t.title as string,
    pages: (t.scan_pages as { count: number }[])[0]?.count ?? 0,
    units: (t.scan_units as { count: number }[])[0]?.count ?? 0,
  }));
}

export async function fetchFirstPage(db: SupabaseClient, slug: string): Promise<number | null> {
  const { data } = await db.from("scan_pages").select("page").eq("text_slug", slug).order("page").limit(1);
  return (data?.[0]?.page as number | undefined) ?? null;
}

export async function fetchScanPage(db: SupabaseClient, slug: string, page: number): Promise<ScanPageView | null> {
  const [text, pageRow, pageNumbers, lines, units] = await Promise.all([
    db.from("scan_texts").select("slug, title").eq("slug", slug).maybeSingle(),
    db.from("scan_pages").select("page, image_path, width, height").eq("text_slug", slug).eq("page", page).maybeSingle(),
    db.from("scan_pages").select("page").eq("text_slug", slug).order("page").range(0, 9999),
    db.from("scan_lines").select("n, type, text, bbox").eq("text_slug", slug).eq("page", page).order("n"),
    db.from("scan_units").select("seq, label, pages, source, translation, literal, context, nuances, doubts, terms, gurbani").eq("text_slug", slug).contains("pages", [page]).order("seq"),
  ]);
  for (const r of [text, pageRow, pageNumbers, lines, units]) if (r.error) throw new Error(r.error.message);
  if (!text.data || !pageRow.data) return null;
  const seqs = (units.data ?? []).map((u) => u.seq as number);
  const unitLines = seqs.length
    ? await db.from("scan_unit_lines").select("seq, page, n").eq("text_slug", slug).in("seq", seqs)
    : { data: [], error: null };
  if (unitLines.error) throw new Error(unitLines.error.message);
  return shapeScanPage({
    text: text.data as ScanPageRows["text"],
    page: pageRow.data as ScanPageRows["page"],
    pageNumbers: (pageNumbers.data ?? []).map((p) => p.page as number),
    lines: (lines.data ?? []) as ScanLineRow[],
    units: (units.data ?? []) as ScanUnitRow[],
    unitLines: (unitLines.data ?? []) as ScanPageRows["unitLines"],
  });
}
