import { notFound } from "next/navigation";
import { curatorDb, isCurator } from "@/lib/curator";
import { fetchDraft } from "@/lib/padarth/fetch";
import { parseScope, scopeHref } from "@/lib/padarth/scope";
import { PadarthDraftView } from "@/components/padarth/DraftView";
import { fetchHintPicks, fetchPicks, hintsBySurface } from "@/lib/padarth/picks";

// The pad-arth builder (#23), read-only for now: pick an ang, a shabad or a bani paragraph and
// see every word of every line with every gloss the database holds. Reads through the service
// role, since Sahib Singh's pad-arth and Shackle are curator-only (069). Needs ?key=ADMIN_KEY.
export const dynamic = "force-dynamic";
export const metadata = { title: "Pad-arth builder", robots: { index: false, follow: false } };

type Params = Record<string, string | string[] | undefined>;

export default async function PadarthBuilderPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const key = typeof params.key === "string" ? params.key : undefined;
  if (!isCurator(key)) notFound();

  const db = curatorDb(true);
  const scope = parseScope(params);
  const [banis, sources, draft] = await Promise.all([
    db.from("banis").select("id, name_gurmukhi, name_english, paragraphs").order("id").then((r) => r.data ?? []),
    db.from("sources").select("code, name").order("rank").then((r) => r.data ?? []),
    scope ? fetchDraft(db, scope) : null,
  ]);

  // Saved picks on these lines, and what was picked for the same words elsewhere (hints only).
  const lineIds = draft?.lines.map((l) => l.id) ?? [];
  const surfaces = draft?.drafts.flatMap((d) => d.words.map((w) => w.gurmukhi)) ?? [];
  const [saved, hintPicks] = lineIds.length ? await Promise.all([fetchPicks(db, lineIds), fetchHintPicks(db, surfaces)]) : [null, []];
  const hints = [...hintsBySurface(hintPicks, new Set(lineIds))];

  const current = (k: string) => (typeof params[k] === "string" ? (params[k] as string) : "");
  const bani = scope?.kind === "paragraph" ? banis.find((b) => b.id === scope.baniId) : undefined;
  const prev =
    scope?.kind === "paragraph" && scope.ordinal > 1
      ? scopeHref({ ...scope, ordinal: scope.ordinal - 1 }, key!)
      : scope?.kind === "ang" && scope.ang > 1
        ? scopeHref({ ...scope, ang: scope.ang - 1 }, key!)
        : null;
  const next =
    scope?.kind === "paragraph" && (!bani || scope.ordinal < bani.paragraphs)
      ? scopeHref({ ...scope, ordinal: scope.ordinal + 1 }, key!)
      : scope?.kind === "ang"
        ? scopeHref({ ...scope, ang: scope.ang + 1 }, key!)
        : null;

  return (
    <main className="padarth-page">
      <h1>Pad-arth builder</h1>
      <div className="padarth-scope">
        <form method="get" action="/admin/padarth">
          <input type="hidden" name="key" value={key} />
          <label>
            Bani{" "}
            <select name="bani" defaultValue={current("bani") || "2"}>
              {banis.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name_gurmukhi} ({b.paragraphs})
                </option>
              ))}
            </select>
          </label>{" "}
          <label>
            Paragraph <input name="p" type="number" min={1} defaultValue={current("p") || "1"} className="padarth-number" />
          </label>{" "}
          <button type="submit">Open</button>
        </form>
        <form method="get" action="/admin/padarth">
          <input type="hidden" name="key" value={key} />
          <label>
            Ang <input name="ang" type="number" min={1} defaultValue={current("ang")} className="padarth-number" required />
          </label>{" "}
          <label>
            of{" "}
            <select name="source" defaultValue={current("source") || "sggs_banidb_v2"}>
              {sources.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>{" "}
          <button type="submit">Open</button>
        </form>
        <form method="get" action="/admin/padarth">
          <input type="hidden" name="key" value={key} />
          <label>
            Shabad <input name="shabad" type="number" min={1} defaultValue={current("shabad")} className="padarth-number" required />
          </label>{" "}
          <button type="submit">Open</button>
        </form>
      </div>

      {!scope && Object.keys(params).some((k) => k !== "key") && <p role="alert">That isn&apos;t an ang, shabad or paragraph.</p>}
      {draft && (
        <>
          <nav className="padarth-nav">
            {prev && <a href={prev}>← Previous</a>}
            <span>
              {scope?.kind === "paragraph" && `${bani?.name_gurmukhi ?? `Bani ${scope.baniId}`}, paragraph ${scope.ordinal}`}
              {scope?.kind === "ang" && `Ang ${scope.ang}`}
              {scope?.kind === "shabad" && `Shabad ${scope.shabadId}`}
              {` · ${draft.lines.length} lines`}
            </span>
            {next && <a href={next}>Next →</a>}
          </nav>
          {draft.lines.length === 0 ? <p>No lines here.</p> : <PadarthDraftView
              key={lineIds.join(",")}
              lines={draft.lines}
              drafts={draft.drafts}
              curatorKey={key!}
              picks={saved?.picks ?? []}
              lineNotes={[...(saved?.lineNotes ?? new Map<number, string>())]}
              hints={hints}
            />}
        </>
      )}
    </main>
  );
}
