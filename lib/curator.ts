import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase, supabaseAdmin } from "./supabase";

// Curator mode (#125). Public pages hide curation tooling (flag forms per row,
// provenance pills outside the Sources tab, spelling caveats, methodology and
// roadmap copy); opening a page with ?key=ADMIN_KEY shows it. Same key, same
// check as the /admin/* pages.

export function isCurator(key: string | null | undefined): boolean {
  const adminKey = process.env.ADMIN_KEY;
  return !!adminKey && key === adminKey;
}

/** Carry the curator key on an internal link so the mode survives navigation. */
export function withCuratorKey(href: string, key: string | null): string {
  if (!key) return href;
  return `${href}${href.includes("?") ? "&" : "?"}key=${encodeURIComponent(key)}`;
}

/**
 * The client a page reads through. Curator-only sources (#258, migration 069) are hidden from the
 * anon key by RLS, so curator mode reads through the service role. Server-side only. Without a
 * service key this throws rather than quietly showing the curator the public view.
 */
export function curatorDb(curator: boolean): SupabaseClient {
  return curator ? supabaseAdmin() : supabase;
}

const SOURCE_CODE = /^[a-z0-9_]+$/;

/**
 * PostgREST `.or()` filter for public word listings: corpus words, words we added ourselves
 * (origin_source null), and off-corpus words from public sources. Words from curator-only sources
 * (#258) stay out. Migration 069 leaves `words` readable so its search indexes keep working, so this
 * is applied in the query, not by RLS.
 */
export function publicOriginFilter(publicCodes: string[]): string {
  for (const c of publicCodes) if (!SOURCE_CODE.test(c)) throw new Error(`Unexpected source code: ${c}`);
  const base = "in_corpus.eq.true,origin_source.is.null";
  return publicCodes.length ? `${base},origin_source.in.(${publicCodes.join(",")})` : base;
}

/** Source codes whose data is public (source_rights, migration 069). */
export async function fetchPublicCodes(db: SupabaseClient = supabase): Promise<string[]> {
  const { data, error } = await db.from("source_rights").select("code").eq("visibility", "public");
  if (error) throw new Error(`fetchPublicCodes: ${error.message}`);
  return ((data ?? []) as Array<{ code: string }>).map((r) => r.code);
}

/** Whether an off-corpus word from this origin may be shown publicly. */
export async function isPublicOrigin(origin: string | null, db: SupabaseClient = supabase): Promise<boolean> {
  if (!origin) return true;
  const { data } = await db.from("source_rights").select("visibility").eq("code", origin).maybeSingle();
  return (data as { visibility?: string } | null)?.visibility === "public";
}
