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
const PUBLIC_SRC = "selfhost_test_public";
const CURATOR_SRC = "selfhost_test_curator";
let db: SupabaseClient;
let wordId: number;

// Removes every fixture row, in foreign-key order. Safe to run when there are none.
async function cleanUp() {
  const w = await db.from("words").delete().eq("gurmukhi", WORD); // definitions and flags cascade
  const ds = await db.from("dict_sources").delete().in("code", [PUBLIC_SRC, CURATOR_SRC]);
  const sr = await db.from("source_rights").delete().in("code", [PUBLIC_SRC, CURATOR_SRC]);
  for (const r of [w, ds, sr]) expect(r.error).toBeNull();
}

// The real rows the fixtures sit next to. This suite runs against live servers, so its setup and
// cleanup must leave them exactly as they were (an upsert once renamed real dictionary sources).
const realRows = async () => {
  const [ds, sr] = await Promise.all([
    admin().from("dict_sources").select("*").order("id"),
    admin().from("source_rights").select("*").order("code"),
  ]);
  expect(ds.error).toBeNull();
  expect(sr.error).toBeNull();
  return JSON.stringify([ds.data, sr.data]);
};
let before = "";

describe.skipIf(!live)("self-hosted gateway", () => {
  beforeAll(async () => {
    db = admin();
    before = await realRows();
    // Fixture sources of their own, never real ones: one released as public in source_rights,
    // one with no row there (curator-only, migration 069). Leftovers from an interrupted run go first.
    await cleanUp();
    const rights = await db.from("source_rights").insert({ code: PUBLIC_SRC, visibility: "public" });
    expect(rights.error).toBeNull();
    const ds = await db
      .from("dict_sources")
      .insert([
        { code: PUBLIC_SRC, name: "self-host test: public" },
        { code: CURATOR_SRC, name: "self-host test: curator-only" },
      ])
      .select("id, code");
    expect(ds.error).toBeNull();
    const id = (code: string) => ds.data!.find((d) => d.code === code)!.id;

    const w = await db.from("words").upsert({ gurmukhi: WORD }, { onConflict: "gurmukhi" }).select("id").single();
    expect(w.error).toBeNull();
    wordId = w.data!.id;

    await db.from("definitions").delete().eq("word_id", wordId);
    const defs = await db.from("definitions").insert([
      { word_id: wordId, dict_source_id: id(PUBLIC_SRC), sense_number: 1, definition_text: "public sense" },
      { word_id: wordId, dict_source_id: id(CURATOR_SRC), sense_number: 1, definition_text: "curator-only sense" },
    ]);
    expect(defs.error).toBeNull();
  });

  afterAll(async () => {
    await cleanUp();
    expect(await realRows()).toBe(before);
  });

  it("serves PostgREST under /rest/v1", async () => {
    const { error, status } = await anon().from("words").select("id").limit(1);
    expect(error).toBeNull();
    expect(status).toBe(200);
  });

  it("answers /health without an apikey once the database is reachable (uptime checks)", async () => {
    const res = await fetch(`${URL}/health`);
    expect(res.status).toBe(200);
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

  // A key that's been replaced is still validly signed (same JWT secret), so the gateway accepts
  // only the current keys as the bearer token too, or none (PostgREST then uses anon).
  it("refuses a validly signed token that isn't one of the current keys", async () => {
    const secret = process.env.SELFHOST_JWT_SECRET;
    expect(secret, "set SELFHOST_JWT_SECRET").toBeTruthy();
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const body = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ iss: "gurmukhi-kosh", role: "service_role", iat: 1 })}`;
    const old = `${body}.${createHmac("sha256", secret!).update(body).digest("base64url")}`;
    const res = await fetch(`${URL}/rest/v1/words?select=id&limit=1`, {
      headers: { apikey: ANON, Authorization: `Bearer ${old}` },
    });
    expect(res.status).toBe(401);
  });

  it("serves a request with only the apikey header (no Authorization) as anon", async () => {
    const res = await fetch(`${URL}/rest/v1/words?select=id&limit=1`, { headers: { apikey: ANON } });
    expect(res.status).toBe(200);
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
