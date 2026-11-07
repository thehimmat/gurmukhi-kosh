// Place pad-arth terms on the words of their line.
//
// A term (ਸੋਚੈ, ਨ ਹੋਵਈ, ਕੂੜੈ ਪਾਲਿ) is matched against the line's tokens
// exactly, after orthographic normalisation only (Unicode form, pairin haha).
// No fuzzy tier: when Sahib Singh glosses a different form than the line has
// (ਪੁਰੀ beside ਪੁਰੀਆ, ਕੋਟੁ in an aside on ਕੋਟਿ) the term is left unmatched and
// shown as such, rather than guessed onto a similar-looking word.
//
// One exception, still exact: a compound spaced differently (#179). When the
// term isn't in the line as written, but its letters with the spaces taken out
// are 1–3 consecutive line words joined, it matches those words: ਝਿਲਿਮਿਲਿਕਾਰੁ on
// the line's ਝਿਲਿ ਮਿਲਿ ਕਾਰੁ, or ਭਖ ਸਾਰ on the line's ਭਖਸਾਰ.

export type TermMatch = {
  /** Token positions the term covers, ascending. */
  positions: number[];
  /**
   * "gapped": a phrase whose words are apart in the line (ਕੂੜੈ … ਪਾਲਿ).
   * "compound": the same letters spaced differently (ਝਿਲਿਮਿਲਿਕਾਰੁ / ਝਿਲਿ ਮਿਲਿ ਕਾਰੁ).
   */
  match: "exact" | "gapped" | "compound";
};

// Pairin haha: the line text writes U+0A51 (ਜਿਨੑ); the pad-arth writes virama
// + ਹ, sometimes twice (ਜਿਨ੍ਹ੍ਹ).
const PAIRIN_HAHA = /(?:੍ਹ)+|ੑ/g;
const JOINERS = /[‌‍]/g;

/** The spelling key used for matching: NFC, no joiners, one pairin haha. */
export function normalise(word: string): string {
  return word.normalize("NFC").replace(JOINERS, "").replace(PAIRIN_HAHA, "ੑ");
}

function contiguousMatches(line: string[], term: string[]): number[][] {
  const out: number[][] = [];
  for (let start = 0; start + term.length <= line.length; start++) {
    if (term.every((w, i) => line[start + i] === w)) {
      out.push(term.map((_, i) => start + i));
    }
  }
  return out;
}

/** Earliest in-order placement of a phrase's words, with gaps allowed. */
function gappedMatch(line: string[], term: string[]): number[] | null {
  const positions: number[] = [];
  let from = 0;
  for (const w of term) {
    const at = line.indexOf(w, from);
    if (at < 0) return null;
    positions.push(at);
    from = at + 1;
  }
  return positions;
}

const MAX_COMPOUND_WORDS = 3;

/** Runs of 1–3 consecutive line words that, joined, spell the term without its spaces. */
function compoundMatches(line: string[], term: string[]): number[][] {
  const joined = term.join("");
  const out: number[][] = [];
  for (let k = 1; k <= MAX_COMPOUND_WORDS; k++) {
    if (k === term.length) continue; // spaced the same: that's an exact match or none
    for (let start = 0; start + k <= line.length; start++) {
      if (line.slice(start, start + k).join("") === joined) out.push(Array.from({ length: k }, (_, i) => start + i));
    }
  }
  return out;
}

/**
 * One result per term, in input order; null when the term is not in the line.
 * A term repeated in the pad-arth (ਤਾਣੁ … ਤਾਣੁ) takes the next occurrence of
 * the word each time, and the first one again once every occurrence is taken.
 */
export function alignTerms(tokens: string[], terms: string[]): (TermMatch | null)[] {
  const line = tokens.map(normalise);
  const taken = new Map<string, Set<string>>();

  return terms.map((rawTerm) => {
    const term = rawTerm.split(/\s+/).filter(Boolean).map(normalise);
    if (term.length === 0) return null;
    const key = term.join(" ");

    let candidates = contiguousMatches(line, term);
    let match: TermMatch["match"] = "exact";
    if (candidates.length === 0 && term.length > 1) {
      const gapped = gappedMatch(line, term);
      if (gapped) candidates = [gapped];
      match = "gapped";
    }
    if (candidates.length === 0) {
      candidates = compoundMatches(line, term);
      match = "compound";
    }
    if (candidates.length === 0) return null;

    const used = taken.get(key) ?? new Set<string>();
    taken.set(key, used);
    const chosen = candidates.find((c) => !used.has(c.join(","))) ?? candidates[0];
    used.add(chosen.join(","));
    return { positions: chosen, match };
  });
}
