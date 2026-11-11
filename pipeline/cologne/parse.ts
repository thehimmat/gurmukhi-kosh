/**
 * Cologne Digital Sanskrit Dictionaries' source format (github.com/sanskrit-lexicon/csl-orig,
 * `v02/<dict>/<dict>.txt`). Every record is
 *
 *   <L>id<pc>page,col<k1>headword<k2>headword with hyphens[<h>homograph][<e>level]
 *   …body lines…
 *   <LEND>
 *
 * with Sanskrit in SLP1 inside <s>…</s> and in the keys. L ids stay put across Cologne's
 * corrections, so they key our entries. The same format serves every csl-orig dictionary.
 */
import sanscriptDefault from "@indic-transliteration/sanscript";

const sanscript = (sanscriptDefault as unknown as { t?: unknown }).t
  ? sanscriptDefault
  : (sanscriptDefault as unknown as { default: typeof sanscriptDefault }).default;

export type CslRecord = {
  L: string;
  pc: string;
  k1: string;
  k2: string;
  h: string | null;
  e: string;
  text: string;
};

const HEAD = /^<L>([^<]+)<pc>([^<]*)<k1>([^<]+)<k2>([^<]*)(?:<h>([^<]*))?(?:<e>(.*))?$/;

export function parseCsl(source: string): CslRecord[] {
  const out: CslRecord[] = [];
  let cur: CslRecord | null = null;
  let body: string[] = [];
  for (const raw of source.split("\n")) {
    const line = raw.replace(/\r$/, "");
    if (cur === null) {
      if (!line.startsWith("<L>")) continue; // the file's header and blank lines
      const m = HEAD.exec(line);
      if (!m) throw new Error(`unreadable record header: ${line.slice(0, 80)}`);
      cur = { L: m[1], pc: m[2], k1: m[3], k2: m[4], h: m[5] ?? null, e: (m[6] ?? "").trim(), text: "" };
      body = [];
    } else if (line.startsWith("<LEND>")) {
      // csl-orig has the odd stray character after the marker (mw L196225: `<LEND><`)
      cur.text = body.join("\n");
      out.push(cur);
      cur = null;
    } else if (line.startsWith("<L>")) {
      throw new Error(`record L${cur.L} has no <LEND>`);
    } else {
      body.push(line);
    }
  }
  if (cur) throw new Error(`record L${cur.L} has no <LEND>`);
  return out;
}

export const slp1ToIAST = (s: string) => sanscript.t(s, "slp1", "iast");

/** The body as plain text: Sanskrit (<s>) in IAST, other tags' text kept, empty tags dropped. */
export function plainBody(text: string): string {
  return text
    .replace(/<s>([^<]*)<\/s>/g, (_, s: string) => slp1ToIAST(s))
    .replace(/<[^>]*\/>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/[ \t]+/g, " ")
    .trim();
}
