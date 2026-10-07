// Curator mode (#125). Public pages hide curation tooling (flag forms per row,
// provenance pills outside the Sources tab, spelling caveats, methodology and
// roadmap copy); opening a page with ?key=ADMIN_KEY shows it. Same key, same
// check as the /admin/* pages.

export function isCurator(key: string | null | undefined): boolean {
  const adminKey = process.env.ADMIN_KEY;
  return !!adminKey && key === adminKey;
}

/** Carry the curator key on an internal link so the mode survives navigation. */
export function withCuratorKey(href: string, key: string | null): string {
  if (!key) return href;
  return `${href}${href.includes("?") ? "&" : "?"}key=${encodeURIComponent(key)}`;
}
