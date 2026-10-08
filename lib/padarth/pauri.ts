// Group a shabad's lines into pauris (stanzas) for passage selection.
//
// A stanza ends at the line carrying its verse tally (॥੧॥, or a chain like
// ॥੪॥੧੯॥੮੯॥). lib/gurmukhi-numerals tells tallies from heading numbers
// (ਮਹਲਾ ੧), so only a real tally closes a group. In Japji this reproduces the
// pauris, with the Mool Mantar, ਜਪੁ and the opening salok as their own group.

import { extractNumerals } from "../gurmukhi-numerals";

function closesStanza(gurmukhi: string): boolean {
  return extractNumerals(gurmukhi).some((n) => n.role === "verse_marker");
}

/** Lines in reading order → consecutive groups, each ending at a tally. */
export function pauriGroups<T extends { gurmukhi: string }>(lines: T[]): T[][] {
  const groups: T[][] = [];
  let current: T[] = [];
  for (const line of lines) {
    current.push(line);
    if (closesStanza(line.gurmukhi)) {
      groups.push(current);
      current = [];
    }
  }
  if (current.length > 0) groups.push(current);
  return groups;
}
