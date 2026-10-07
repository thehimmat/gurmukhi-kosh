// The site's name (#133), shared by every page title and header. The repo and
// package keep the name gurmukhi-kosh.

export const SITE_NAME_PA = "ਗੁਰਬਾਣੀ ਖੋਜ ਕੋਸ਼";
export const SITE_NAME_EN = "Gurbani Search Dictionary";

/** Browser-tab title for a page: English, so it reads in any tab or search result. */
export function pageTitle(page: string): string {
  return `${page} — ${SITE_NAME_EN}`;
}

// Header nav (#127), mirrored in gurmukhi-search's lib/site.ts so the shell
// and dictionary zones of the same domain show one menu.
export const NAV_LINKS = [
  { href: "/", label: "Search" },
  { href: "/browse", label: "Browse" },
  { href: "/ang/1", label: "Read by ang" },
  { href: "/about", label: "About" },
] as const;

/** Which nav link a path belongs under; word entries count as Search. */
export function activeNavHref(pathname: string): string | null {
  if (pathname === "/" || pathname.startsWith("/word/")) return "/";
  if (pathname.startsWith("/browse")) return "/browse";
  if (pathname.startsWith("/ang/")) return "/ang/1";
  if (pathname.startsWith("/about")) return "/about";
  return null;
}

/** The texts the dictionary indexes, as named in the `sources` table. */
export const CORPORA = [
  "Sri Guru Granth Sahib Ji",
  "Bhai Gurdas Ji Vaaran",
  "Dasam Bani",
  "Sri Sarbloh Granth",
] as const;
