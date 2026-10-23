import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { pageTitle } from "@/lib/site";
import { curatorDb, isCurator } from "@/lib/curator";
import { fetchLineContext, type Scope } from "@/lib/line-context";
import { LineView } from "./LineView";

// Shared by /line/<id> (scope: passage) and /line/<id>/ang (scope: ang).
const parseLineId = (s: string) => (/^\d+$/.test(s) ? Number(s) : null);

export async function lineMetadata(idParam: string, scope: Scope): Promise<Metadata> {
  const id = parseLineId(idParam);
  const ctx = id ? await fetchLineContext(id, scope) : null;
  const line = ctx?.lines.find((l) => l.id === ctx.lineId);
  return { title: pageTitle(line ? line.gurmukhi.replace(/\s*॥.*$/, "") : "Line") };
}

export async function linePage(idParam: string, scope: Scope) {
  const id = parseLineId(idParam);
  if (!id) notFound();
  const ctx = await fetchLineContext(id, scope);
  if (!ctx) notFound();
  return <LineView ctx={ctx} />;
}

/**
 * The curator's line page (/admin/line/<id>[/ang]?key=ADMIN_KEY): read through the service-role
 * role, so it can show a curator-only corpus (migration 070). Rendered per request, never cached.
 */
export async function adminLinePage(idParam: string, scope: Scope, key: string | undefined) {
  const id = parseLineId(idParam);
  if (!id || !isCurator(key)) notFound();
  const ctx = await fetchLineContext(id, scope, curatorDb(true));
  if (!ctx) notFound();
  return <LineView ctx={ctx} curatorKey={key!} />;
}
