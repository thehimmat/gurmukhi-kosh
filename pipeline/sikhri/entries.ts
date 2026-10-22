/**
 * SikhRI's crawls (scrape.ts: English entries.jsonl, Panjabi entries-pa.jsonl) as dict_entries rows.
 *
 * One entry per SikhRI id (`wn`), keyed `sikhri:wn<id>`: SikhRI's own id is the only key that stays
 * put, since an English-only entry has no Gurmukhi yet and a homograph number would shift if SikhRI
 * added one. The English and Panjabi editions of an entry are merged; each keeps its own meaning,
 * grammar, etymology and page URL under `parsed.en` / `parsed.pa`.
 *
 * The headword is the Gurmukhi the Panjabi glossary prints. Where only the English edition lists an
 * entry, its Gurmukhi may be inferred from a homograph (plan.ts, `gurmukhi_inferred`); then the
 * printed headword is the romanization, and the inferred spelling is used only for linking.
 */
import { entryRef, type DictEntry } from "../shared/dict-entries";

type Edition = { meaning: string | null; grammar: string | null; etymology: string | null; source_url: string };
export type SikhriEnLine = Edition & {
  gurmukhi: string | null;
  gurmukhi_inferred?: boolean;
  wn: string;
  wn_id: string;
  found: boolean;
  headword_roman: string | null;
};
export type SikhriPaLine = Edition & { lang?: string; gurmukhi: string; wn: string; wn_id: string; found: boolean };

const hasContent = (e: Edition & { found: boolean }) => e.found && Boolean(e.meaning || e.grammar || e.etymology);

const edition = (e: Edition) => ({
  meaning: e.meaning,
  grammar: e.grammar,
  etymology: e.etymology,
  url: e.source_url,
});

function body(en: Edition | undefined, pa: Edition | undefined): string {
  const lines: string[] = [];
  if (en?.meaning) lines.push(en.meaning);
  if (en?.grammar) lines.push(`Grammar: ${en.grammar}`);
  if (en?.etymology) lines.push(`Etymology: ${en.etymology}`);
  if (pa?.meaning) lines.push(pa.meaning);
  if (pa?.grammar) lines.push(`ਵਿਆਕਰਣ: ${pa.grammar}`);
  if (pa?.etymology) lines.push(`ਵਿਉਤਪਤੀ: ${pa.etymology}`);
  return lines.join("\n");
}

export function sikhriEntries(enLines: SikhriEnLine[], paLines: SikhriPaLine[]): DictEntry[] {
  const en = new Map(enLines.filter(hasContent).map((e) => [e.wn_id, e]));
  const pa = new Map(paLines.filter(hasContent).map((e) => [e.wn_id, e]));
  const ids = [...new Set([...en.keys(), ...pa.keys()])].sort((a, b) => Number(a) - Number(b));

  return ids.map((id) => {
    const e = en.get(id);
    const p = pa.get(id);
    const printed = p?.gurmukhi ?? (e && !e.gurmukhi_inferred ? e.gurmukhi : null);
    const gurmukhi = printed ?? e?.gurmukhi ?? null;
    const roman = e?.headword_roman ?? null;
    const parsed: Record<string, unknown> = {
      wn: (e ?? p)!.wn,
      ...(roman ? { roman } : {}),
      ...(!printed && gurmukhi ? { gurmukhi_inferred: true } : {}),
      ...(e ? { en: edition(e) } : {}),
      ...(p ? { pa: edition(p) } : {}),
    };
    return {
      entry_ref: entryRef("sikhri", `wn${id}`),
      seq: Number(id),
      headword_native: printed ?? roman ?? gurmukhi ?? `wn${id}`,
      script: printed ? "gurmukhi" : "latin",
      headword_gurmukhi: gurmukhi,
      body_raw: body(e, p),
      parsed,
      source_url: e?.source_url ?? p!.source_url,
    };
  });
}
