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

/**
 * The curator's view: the service role, which RLS does not filter. Corpus-scale checks on data that
 * includes curator-only sources (#258, migration 069) read through this; what the public sees is
 * checked through anonDb.
 */
export function curatorDb() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY not set (.env.local)");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false } });
}

export async function sourceId(db: ReturnType<typeof anonDb>, code: string): Promise<number> {
  const { data, error } = await db.from("sources").select("id").eq("code", code).single();
  if (error || !data) throw new Error(`source ${code} not found: ${error?.message}`);
  return (data as { id: number }).id;
}
