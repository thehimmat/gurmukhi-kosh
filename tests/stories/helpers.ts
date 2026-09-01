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

export async function sourceId(db: ReturnType<typeof anonDb>, code: string): Promise<number> {
  const { data, error } = await db.from("sources").select("id").eq("code", code).single();
  if (error || !data) throw new Error(`source ${code} not found: ${error?.message}`);
  return (data as { id: number }).id;
}
