import { cache } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { pageTitle } from "@/lib/site";
import { curatorDb } from "@/lib/curator";
import { adminKey } from "@/lib/curator-session";
import { fetchLineContext, type Scope } from "@/lib/line-context";
import { LineView } from "./LineView";

// Shared by /line/<id> (scope: passage) and /line/<id>/ang (scope: ang).
const parseLineId = (s: string) => (/^\d+$/.test(s) ? Number(s) : null);

// generateMetadata and the page both need the context; cache() makes that one
// read per request instead of two (#229). Public reads only: the curator page
// below reads through another client and must not share this cache.
const publicLineContext = cache((id: number, scope: Scope) => fetchLineContext(id, scope));

export async function lineMetadata(idParam: string, scope: Scope): Promise<Metadata> {
  const id = parseLineId(idParam);
  const ctx = id ? await publicLineContext(id, scope) : null;
  const line = ctx?.lines.find((l) => l.id === ctx.lineId);
  return { title: pageTitle(line ? line.gurmukhi.replace(/\s*॥.*$/, "") : "Line") };
}

export async function linePage(idParam: string, scope: Scope) {
  const id = parseLineId(idParam);
  if (!id) notFound();
  const ctx = await publicLineContext(id, scope);
  if (!ctx) notFound();
  return <LineView ctx={ctx} />;
}

/**
 * The curator's line page (/admin/line/<id>[/ang], with the admin cookie): read through the service-role
 * role, so it can show a curator-only corpus (migration 070). Rendered per request, never cached.
 */
export async function adminLinePage(idParam: string, scope: Scope, keyParam: string | undefined) {
  const id = parseLineId(idParam);
  const key = await adminKey(keyParam);
  if (!id || !key) notFound();
  const ctx = await fetchLineContext(id, scope, curatorDb(true));
  if (!ctx) notFound();
  return <LineView ctx={ctx} curatorKey={key} />;
}
