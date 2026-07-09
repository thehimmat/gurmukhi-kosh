/**
 * Integration tests for gurmukhi-kosh API routes.
 * Runs against the real Supabase DB using .env.local credentials.
 *
 * Run: npm test
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// ── Environment ────────────────────────────────────────────────────────────────

describe("environment", () => {
  it("NEXT_PUBLIC_SUPABASE_URL is set", () => {
    expect(SUPABASE_URL).toBeTruthy();
    expect(SUPABASE_URL).toContain("supabase.co");
  });

  it("NEXT_PUBLIC_SUPABASE_ANON_KEY is set", () => {
    expect(SUPABASE_ANON_KEY).toBeTruthy();
    expect(SUPABASE_ANON_KEY.length).toBeGreaterThan(20);
  });
});

// ── Database connectivity ──────────────────────────────────────────────────────

describe("database", () => {
  let db: ReturnType<typeof createClient>;

  beforeAll(() => {
    db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  });

  it("can connect and query words table", async () => {
    const { data, error } = await db.from("words").select("id").limit(1);
    expect(error).toBeNull();
    expect(data).toBeTruthy();
    expect(data!.length).toBeGreaterThan(0);
  });

  it("words table has expected row count (>20k)", async () => {
    const { count, error } = await db
      .from("words")
      .select("*", { count: "exact", head: true });
    expect(error).toBeNull();
    expect(count).toBeGreaterThan(20000);
  });

  it("word frequencies are populated (no all-zero rows)", async () => {
    const { count, error } = await db
      .from("words")
      .select("*", { count: "exact", head: true })
      .gt("frequency", 0);
    expect(error).toBeNull();
    expect(count).toBeGreaterThan(20000);
  });

  it("ਹਰਿ has frequency > 5000 (most common word sanity check)", async () => {
    const { data, error } = await db
      .from("words")
      .select("gurmukhi, frequency")
      .eq("gurmukhi", "ਹਰਿ")
      .single();
    expect(error).toBeNull();
    expect((data as any).frequency).toBeGreaterThan(5000);
  });

  it("lines table has expected row count (>50k)", async () => {
    const { count, error } = await db
      .from("lines")
      .select("*", { count: "exact", head: true });
    expect(error).toBeNull();
    expect(count).toBeGreaterThan(50000);
  });

  it("word_occurrences table has expected row count (>300k)", async () => {
    const { count, error } = await db
      .from("word_occurrences")
      .select("*", { count: "exact", head: true });
    expect(error).toBeNull();
    expect(count).toBeGreaterThan(300000);
  });

  it("shabads have raag data populated", async () => {
    const { count, error } = await db
      .from("shabads")
      .select("*", { count: "exact", head: true })
      .not("raag_english", "is", null);
    expect(error).toBeNull();
    expect(count).toBeGreaterThan(1000);
  });
});

// ── Search query logic ─────────────────────────────────────────────────────────

describe("search", () => {
  let db: ReturnType<typeof createClient>;

  beforeAll(() => {
    db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  });

  it("prefix search for ਸਤਿ returns results", async () => {
    const { data, error } = await db
      .from("words")
      .select("id, gurmukhi, frequency")
      .ilike("gurmukhi", "ਸਤਿ%")
      .order("frequency", { ascending: false })
      .limit(20);
    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThan(0);
    expect((data as any[])[0].gurmukhi).toMatch(/^ਸਤਿ/);
  });

  it("search results are ordered by frequency descending", async () => {
    const { data, error } = await db
      .from("words")
      .select("id, gurmukhi, frequency")
      .ilike("gurmukhi", "ਨਾਮ%")
      .order("frequency", { ascending: false })
      .limit(10);
    expect(error).toBeNull();
    const rows = data as any[];
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1].frequency).toBeGreaterThanOrEqual(rows[i].frequency);
    }
  });

  it("word page query returns occurrences with line + shabad data", async () => {
    const { data: wordRow, error: wordErr } = await db
      .from("words")
      .select("id, gurmukhi, frequency")
      .eq("gurmukhi", "ਨਾਨਕ")
      .single();
    expect(wordErr).toBeNull();
    const wordId = (wordRow as any).id;

    const { data: occs, error: occsErr } = await db
      .from("word_occurrences")
      .select(`
        id, position,
        lines ( id, ang, gurmukhi, translation_en,
          shabads ( id, raag_english, writer_english )
        )
      `)
      .eq("word_id", wordId)
      .limit(5);
    expect(occsErr).toBeNull();
    expect(occs!.length).toBeGreaterThan(0);
    const first = occs![0] as any;
    expect(first.lines).toBeTruthy();
    expect(first.lines.ang).toBeGreaterThan(0);
  });
});

// ── Production smoke test ──────────────────────────────────────────────────────

describe("production", () => {
  // This app's own production deployment. Not the public search.atthebunga.com
  // domain: the shell there shadows / and /api/search with its own versions
  // (kosh.atthebunga.com is decommissioned and 308s to the shell).
  const BASE = "https://gurmukhi-kosh.vercel.app";

  it("homepage responds 200", async () => {
    const res = await fetch(BASE);
    expect(res.status).toBe(200);
  }, 10000);

  it("/api/search returns results for ਸਤਿ", async () => {
    const res = await fetch(`${BASE}/api/search?q=${encodeURIComponent("ਸਤਿ")}`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.words).toBeTruthy();
    expect(data.words.length).toBeGreaterThan(0);
  }, 10000);

  it("/api/word returns data for ਨਾਨਕ", async () => {
    const res = await fetch(`${BASE}/api/word/${encodeURIComponent("ਨਾਨਕ")}`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.word.gurmukhi).toBe("ਨਾਨਕ");
    expect(data.word.frequency).toBeGreaterThan(1000);
  }, 10000);
});
