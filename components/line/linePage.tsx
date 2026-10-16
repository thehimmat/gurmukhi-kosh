import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { pageTitle } from "@/lib/site";
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
