// The site's name (#133), shared by every page title and header. The repo and
// package keep the name gurmukhi-kosh.

export const SITE_NAME_PA = "ਗੁਰਬਾਣੀ ਖੋਜ ਕੋਸ਼";
export const SITE_NAME_EN = "Gurbani Search Dictionary";

/** Browser-tab title for a page: English, so it reads in any tab or search result. */
export function pageTitle(page: string): string {
  return `${page} — ${SITE_NAME_EN}`;
}
