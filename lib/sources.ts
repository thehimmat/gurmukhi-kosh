// What the pages know about a line's source, from the sources table (migration 065) rather than a
// list of source codes in code. Kept apart from lib/line-context so client components can use it.

// A line's source as the pages read it (sources, migration 065). Select it with SOURCE_COLUMNS.
export type SourceMeta = { code: string; name: string; slug: string; page_unit: string };
export const SOURCE_COLUMNS = "code, name, slug, page_unit";

/** Where a line is, in its source's own page unit: "Ang 12", "Vaar 3", "Ghazal 61". */
export function placeLabel(source: Pick<SourceMeta, "page_unit"> | null | undefined, ang: number): string {
  return `${source?.page_unit ?? "Ang"} ${ang}`;
}

/** SGGS has what other sources don't yet: /ang/N browsing and raag headings. */
export function isSggs(source: { slug: string | null } | null | undefined): boolean {
  return source?.slug === "sggs";
}
