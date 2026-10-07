// Word-page URL helpers for the not-found state (#126), which only has the
// pathname to go on (Next passes no params to not-found.tsx).

/** The word a /word/<encoded> path asks for, or null for any other path. */
export function wordFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/word\/([^/?#]+)/);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return null;
  }
}

/** The search shell's Gurbani line search for a word (gurmukhi-search reads ?q=). */
export function gurbaniSearchHref(word: string): string {
  return `/?q=${encodeURIComponent(word)}`;
}
