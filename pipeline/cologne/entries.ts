/**
 * csl-orig records as dict_entries rows (migration 089), one row per record.
 *
 * A record is the unit Cologne numbers: a headword, or a further sense of the one before it (an
 * `<e>` level with a letter, e.g. 1A), which may carry a compound of its own as headword. Keying
 * by record keeps every headword linkable; `parsed.parent` points a further sense at its entry.
 *
 * entry_ref is `<code>:L<id>`. The headword is printed in Devanagari; it links on its Gurmukhi
 * spelling (slp1-gurmukhi.ts), and `parsed` keeps the SLP1 keys and an IAST form for display.
 * body_raw is the record exactly as csl-orig has it; `parsed.plain` is a readable rendering.
 */
import sanscriptDefault from "@indic-transliteration/sanscript";
import { entryRef, type DictEntry } from "../shared/dict-entries";
import { plainBody, slp1ToIAST, type CslRecord } from "./parse";
import { slp1ToGurmukhi } from "./slp1-gurmukhi";

const sanscript = (sanscriptDefault as unknown as { t?: unknown }).t
  ? sanscriptDefault
  : (sanscriptDefault as unknown as { default: typeof sanscriptDefault }).default;

const isFurtherSense = (e: string) => /[A-Z]$/.test(e);
const clean = (k1: string) => k1.replace(/[/\\^']/g, "");

export function cologneEntries(code: string, records: CslRecord[]): DictEntry[] {
  let parent: string | null = null;
  return records.map((r, i) => {
    const ref = entryRef(code, `L${r.L}`);
    const further = isFurtherSense(r.e) && parent !== null;
    if (!isFurtherSense(r.e)) parent = ref;
    const k1 = clean(r.k1);
    return {
      entry_ref: ref,
      seq: i + 1,
      page: r.pc || null,
      headword_native: sanscript.t(k1, "slp1", "devanagari"),
      script: "devanagari",
      headword_gurmukhi: slp1ToGurmukhi(k1),
      body_raw: r.text,
      parsed: {
        k1: r.k1,
        k2: r.k2,
        h: r.h,
        e: r.e,
        iast: slp1ToIAST(k1),
        plain: plainBody(r.text),
        ...(further ? { parent } : {}),
      },
    };
  });
}
