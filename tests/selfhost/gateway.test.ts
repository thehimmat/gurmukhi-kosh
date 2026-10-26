/**
 * The self-hosted stack (selfhost/: Postgres 17 + PostgREST behind Caddy) must look like Supabase to
 * supabase-js: the same /rest/v1 path, the same apikey gate, and the same role-based RLS. Runs only
 * against a self-hosted target (SELFHOST_URL and its keys), never the shared project: it writes
 * fixture rows with the service key.
 */
import { createHmac } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.SELFHOST_URL ?? "";
const ANON = process.env.SELFHOST_ANON_KEY ?? "";
const SERVICE = process.env.SELFHOST_SERVICE_KEY ?? "";
const live = !!(URL && ANON && SERVICE);

const anon = () => createClient(URL, ANON, { auth: { persistSession: false } });
const admin = () => createClient(URL, SERVICE, { auth: { persistSession: false } });

// An HS256 token for `role`, signed with a secret the gateway doesn't know.
function forged(role: string): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const body = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ role, iss: "supabase" })}`;
  return `${body}.${createHmac("sha256", "not-the-secret").update(body).digest("base64url")}`;
}

const WORD = "ਸੈਲਫ਼ਹੋਸਟ"; // a fixture word no corpus contains
let db: SupabaseClient;
let wordId: number;

describe.skipIf(!live)("self-hosted gateway", () => {
  beforeAll(async () => {
    db = admin();
    const ds = await db
      .from("dict_sources")
      .upsert(
        [
          { code: "mahan_kosh", name: "Mahan Kosh" },
          { code: "shackle", name: "A Guru Nanak Glossary" },
        ],
        { onConflict: "code" },
      )
      .select("id, code");
    expect(ds.error).toBeNull();
    const id = (code: string) => ds.data!.find((d) => d.code === code)!.id;

    const w = await db.from("words").upsert({ gurmukhi: WORD }, { onConflict: "gurmukhi" }).select("id").single();
    expect(w.error).toBeNull();
    wordId = w.data!.id;

    await db.from("definitions").delete().eq("word_id", wordId);
    const defs = await db.from("definitions").insert([
      { word_id: wordId, dict_source_id: id("mahan_kosh"), sense_number: 1, definition_text: "public sense" },
      { word_id: wordId, dict_source_id: id("shackle"), sense_number: 1, definition_text: "curator-only sense" },
    ]);
    expect(defs.error).toBeNull();
  });

  afterAll(async () => {
    if (wordId) await db.from("words").delete().eq("id", wordId); // definitions and flags cascade
  });

  it("serves PostgREST under /rest/v1", async () => {
    const { error, status } = await anon().from("words").select("id").limit(1);
    expect(error).toBeNull();
    expect(status).toBe(200);
  });

  it("refuses a request without an apikey", async () => {
    const res = await fetch(`${URL}/rest/v1/words?select=id&limit=1`);
    expect(res.status).toBe(401);
  });

  it("answers a browser's CORS preflight, which carries no apikey", async () => {
    const res = await fetch(`${URL}/rest/v1/words`, {
      method: "OPTIONS",
      headers: {
        Origin: "https://example.org",
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "apikey,authorization",
      },
    });
    expect(res.ok).toBe(true);
    expect(res.headers.get("access-control-allow-origin")).toBeTruthy();
  });

  it("caps a page at 1000 rows, like Supabase", async () => {
    const res = await fetch(`${URL}/rest/v1/words?select=id`, {
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, Prefer: "count=exact" },
    });
    expect(res.status).toBeLessThan(300);
    expect(((await res.json()) as unknown[]).length).toBeLessThanOrEqual(1000);
    expect(res.headers.get("content-range")).toMatch(/^0-\d+\/\d+$/);
  });

  it("refuses a token signed with another secret", async () => {
    const t = forged("service_role");
    const res = await fetch(`${URL}/rest/v1/words?select=id&limit=1`, {
      headers: { apikey: t, Authorization: `Bearer ${t}` },
    });
    expect(res.status).toBe(401);
  });

  it("hides curator-only sources from anon (RLS, migration 069)", async () => {
    const { data, error } = await anon().from("definitions").select("definition_text").eq("word_id", wordId);
    expect(error).toBeNull();
    expect(data!.map((d) => d.definition_text)).toEqual(["public sense"]);
  });

  it("lets the service role read past RLS", async () => {
    const { data, error } = await db.from("definitions").select("definition_text").eq("word_id", wordId);
    expect(error).toBeNull();
    expect(data!.map((d) => d.definition_text).sort()).toEqual(["curator-only sense", "public sense"]);
  });

  it("refuses anon writes to the corpus", async () => {
    const { error } = await anon().from("words").insert({ gurmukhi: `${WORD}ਾ` });
    expect(error?.code).toBe("42501");
  });

  it("accepts an anon flag (public insert policy, migration 014)", async () => {
    const { error } = await anon()
      .from("flags")
      .insert({ word_id: wordId, flag_type: "other", message: "self-host gateway test" });
    expect(error).toBeNull();
  });

  // Whether searches find the right rows needs the corpus: run tests/search-rpcs.test.ts against a
  // restored dump for that. This checks the RPC path and anon's EXECUTE grant.
  it("runs search RPCs as anon", async () => {
    const { data, error } = await anon().rpc("search_words_filtered", { p_query: WORD, p_limit: 5 });
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
  });
});
