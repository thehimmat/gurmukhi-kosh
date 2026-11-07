import { notFound } from "next/navigation";
import { curatorDb } from "@/lib/curator";
import { adminKey } from "@/lib/curator-session";
import { fetchDraft } from "@/lib/padarth/fetch";
import { fetchCommentary, fetchPicks } from "@/lib/padarth/picks";
import { buildPreview } from "@/lib/padarth/preview";
import { parseScope, scopeTitle } from "@/lib/padarth/scope";
import { deckBuffer, deckFileName } from "@/lib/padarth/slides";

// The pad-arth for one scope as a .pptx, for Google Slides (#377): GET /admin/padarth/slides?bani=2&p=4.
// The same scope parameters as the builder; the same data as its preview. Behind the admin cookie.
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  if (!(await adminKey())) notFound();
  const url = new URL(req.url);
  const scope = parseScope(Object.fromEntries(url.searchParams));
  if (!scope) return new Response("That isn't an ang, shabad or paragraph.", { status: 400 });

  const db = curatorDb(true);
  const [draft, bani] = await Promise.all([
    fetchDraft(db, scope),
    scope.kind === "paragraph"
      ? db.from("banis").select("name_gurmukhi").eq("id", scope.baniId).maybeSingle().then((r) => (r.data as { name_gurmukhi: string } | null)?.name_gurmukhi)
      : undefined,
  ]);
  const lineIds = draft.lines.map((l) => l.id);
  const [saved, said] = lineIds.length
    ? await Promise.all([fetchPicks(db, lineIds), fetchCommentary(db, lineIds)])
    : [{ picks: [], lineNotes: new Map<number, string>() }, { commentary: [], available: true }];
  const lines = buildPreview(draft.lines, draft.drafts, saved.picks, saved.lineNotes, said.commentary);

  const buf = await deckBuffer(lines, scopeTitle(scope, bani));
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "Content-Disposition": `attachment; filename="${deckFileName(url.searchParams.toString())}"`,
      "Cache-Control": "no-store",
    },
  });
}
