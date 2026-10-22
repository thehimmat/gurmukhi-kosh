// Shared setup for story-tagged acceptance tests (user-stories/*.md).
// Same conventions as tests/api.test.ts: live Supabase via .env.local, and
// the production deployment for route-level checks.

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

export const PROD_BASE = "https://gurmukhi-kosh.vercel.app";

export function anonDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export type Db = ReturnType<typeof anonDb>;

/**
 * The curator's view: the service role, which RLS does not filter. null when no service key is set
 * (CI runs with the anon key only).
 */
export function curatorDb(): Db | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false } });
}

/** Whether migration 069's visibility gate is live: the anon key can read source_rights. */
export async function visibilityLive(): Promise<boolean> {
  const { error } = await anonDb().from("source_rights").select("code").limit(1);
  return !error;
}

/**
 * The client for a check over data from these sources (#258): the curator's when a service key is
 * set; otherwise anon, provided anon can see every one of them (all public, or 069 not live yet).
 * null when the data is hidden from every key available, so the check should skip.
 */
export async function viewFor(codes: string[]): Promise<Db | null> {
  const curator = curatorDb();
  if (curator) return curator;
  const anon = anonDb();
  if (codes.length === 0 || !(await visibilityLive())) return anon;
  const { data, error } = await anon.from("source_rights").select("code, visibility").in("code", codes);
  if (error) throw new Error(`source_rights: ${error.message}`);
  const pub = new Set((data ?? []).filter((r) => r.visibility === "public").map((r) => r.code));
  return codes.every((c) => pub.has(c)) ? anon : null;
}

export async function sourceId(db: ReturnType<typeof anonDb>, code: string): Promise<number> {
  const { data, error } = await db.from("sources").select("id").eq("code", code).single();
  if (error || !data) throw new Error(`source ${code} not found: ${error?.message}`);
  return (data as { id: number }).id;
}
