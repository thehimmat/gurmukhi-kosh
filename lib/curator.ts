import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase, supabaseAdmin } from "./supabase";

// Curator mode (#125). Public pages hide curation tooling (flag forms per row,
// provenance pills outside the Sources tab, spelling caveats, methodology and
// roadmap copy); the curator's copies under /admin show it (/admin/word,
// /admin/line), behind the admin cookie below.

/** Whether `key` is the admin key. Compared in constant time for keys of the same length. */
export function isCurator(key: string | null | undefined): boolean {
  const adminKey = process.env.ADMIN_KEY;
  if (!adminKey || typeof key !== "string" || key.length !== adminKey.length) return false;
  let diff = 0;
  for (let i = 0; i < key.length; i++) diff |= key.charCodeAt(i) ^ adminKey.charCodeAt(i);
  return diff === 0;
}

// The admin key in a cookie (#23). /admin pages and their server actions read it from an httpOnly
// cookie scoped to /admin, so it stays out of their URLs, the access logs and action arguments.
// proxy.ts swaps a ?key=ADMIN_KEY for the cookie, and /admin/logout clears it. Public /word never
// renders curator mode, since the CDN caches it by URL (next.config.ts): /word/<w>?key=… goes to
// its curator copy, /admin/word/<w>.

export const ADMIN_COOKIE = "kosh_admin";
const ADMIN_COOKIE_DAYS = 30;

export function adminCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/admin",
    maxAge: ADMIN_COOKIE_DAYS * 86400,
  };
}

/**
 * What the proxy does with a request's ?key: when it is the admin key, set the cookie and redirect
 * to the same path and query without it; a /word page goes to its /admin/word copy.
 */
export function adminKeyExchange(pathname: string, search: URLSearchParams): { setCookie: boolean; redirectTo: string | null } {
  const keys = search.getAll("key");
  if (keys.length !== 1 || !isCurator(keys[0])) return { setCookie: false, redirectTo: null };
  const target = pathname === "/word" || pathname.startsWith("/word/") ? `/admin${pathname}` : pathname;
  if (target !== "/admin" && !target.startsWith("/admin/")) return { setCookie: true, redirectTo: null };
  const rest = new URLSearchParams(search);
  rest.delete("key");
  const query = rest.toString();
  return { setCookie: true, redirectTo: query ? `${target}?${query}` : target };
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
