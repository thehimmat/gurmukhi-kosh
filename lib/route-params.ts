// Strict parsing of numeric path and query parameters (#226). parseInt would
// read "12abc" as 12, so a malformed URL rendered (and got cached) as a real page.

const WHOLE = /^[1-9]\d*$/;

export const SGGS_ANGS = 1430;

/** An SGGS ang from a path segment, or null if it isn't a plain number in 1..1430. */
export function parseAng(s: string): number | null {
  if (!WHOLE.test(s)) return null;
  const n = Number(s);
  return n <= SGGS_ANGS ? n : null;
}

/** A ?page= value: 1 when absent, null when present but not a positive whole number. */
export function parsePageNumber(s: string | undefined): number | null {
  if (s === undefined) return 1;
  return WHOLE.test(s) ? Number(s) : null;
}
