/**
 * SLP1 (Cologne's ASCII scheme for Sanskrit) → Gurmukhi, spelled the way Gurbani writes a Sanskrit
 * word, so a Cologne headword can be linked to a Kosh word (exactly, or on foldGurmukhi's key).
 *
 * Not a letter-for-letter transliteration (sanscript's "gurmukhi" scheme is, and Gurbani never
 * spells ਧਰ੍ਮ): a cluster is written without a halant unless its second letter is ਰ, ਵ or ਹ, which
 * go beneath; ṛ is ੍ਰਿ (ਰਿ at the start); a nasal before a stop, and anusvāra, are tippi; a final
 * consonant takes no halant; ś and ṣ are both ਸ਼ (the fold drops the nukta). Accents and avagraha
 * are dropped.
 *
 * This finds tatsama spellings (ਪ੍ਰਸਾਦ, ਅੰਤ). Gurbani's tadbhava forms (ਗਿਆਨ for jñāna) and its
 * case endings on consonant stems (ਨਾਮੁ for nāman) need more than spelling; they are not tried here.
 */

const CONSONANT: Record<string, string> = {
  k: "ਕ", K: "ਖ", g: "ਗ", G: "ਘ", N: "ਙ",
  c: "ਚ", C: "ਛ", j: "ਜ", J: "ਝ", Y: "ਞ",
  w: "ਟ", W: "ਠ", q: "ਡ", Q: "ਢ", R: "ਣ",
  t: "ਤ", T: "ਥ", d: "ਦ", D: "ਧ", n: "ਨ",
  p: "ਪ", P: "ਫ", b: "ਬ", B: "ਭ", m: "ਮ",
  y: "ਯ", r: "ਰ", l: "ਲ", v: "ਵ", S: "ਸ਼", z: "ਸ਼", s: "ਸ", h: "ਹ", L: "ਲ਼",
};
const STOPS = new Set("kKgGNcCjJYwWqQRtTdDnpPbBm");
const NASALS = new Set("NYRnm");
const BENEATH = new Set("rvh"); // the letters Gurmukhi writes as a subjoined form

const VOWEL: Record<string, string> = {
  a: "ਅ", A: "ਆ", i: "ਇ", I: "ਈ", u: "ਉ", U: "ਊ",
  e: "ਏ", E: "ਐ", o: "ਓ", O: "ਔ", f: "ਰਿ", F: "ਰੀ", x: "ਲਿ", X: "ਲੀ",
};
const MATRA: Record<string, string> = {
  a: "", A: "ਾ", i: "ਿ", I: "ੀ", u: "ੁ", U: "ੂ",
  e: "ੇ", E: "ੈ", o: "ੋ", O: "ੌ", f: "੍ਰਿ", F: "੍ਰੀ", x: "ਲਿ", X: "ਲੀ",
};
const SIGN: Record<string, string> = { M: "ੰ", H: "ਃ", "~": "ਁ" };
const DROPPED = /[/\\^'|-]/g; // accents, avagraha, danda, compound hyphens

const SLP1 = /^[A-Za-z~]+$/;

export function slp1ToGurmukhi(slp1: string): string | null {
  const s = slp1.replace(DROPPED, "");
  if (!s || !SLP1.test(s)) return null;
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    const next = s[i + 1];
    if (ch in CONSONANT) {
      if (next !== undefined && next in CONSONANT) {
        // a nasal before a stop is tippi (ਅੰਤ, ਸ਼ੰਖ); otherwise the cluster's first letter
        if (NASALS.has(ch) && STOPS.has(next)) out += "ੰ";
        else out += CONSONANT[ch] + (BENEATH.has(next) ? "੍" : "");
      } else {
        out += CONSONANT[ch];
      }
    } else if (ch in VOWEL) {
      const prev = s[i - 1];
      out += prev !== undefined && prev in CONSONANT ? MATRA[ch] : VOWEL[ch];
    } else if (ch in SIGN) {
      out += SIGN[ch];
    } else {
      return null;
    }
  }
  return out.normalize("NFC");
}
