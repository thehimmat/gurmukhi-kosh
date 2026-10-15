/**
 * The 052 RPCs gurmukhi-search calls, as anon: filtered number-role counts,
 * the fuzzy Contains total, and the Dictionary's Scripture/Writer filters.
 * Live DB, like tests/first-letter-search.test.ts; skipped without credentials.
 */
import { describe, it, expect } from "vitest";
import { anonDb } from "./stories/helpers";

const live = !!process.env.NEXT_PUBLIC_SUPABASE_URL;
const SGGS = 1;
const DASAM = 3;

type Role = { role: string; line_count: number };
type WordHit = { id: number; gurmukhi: string; frequency: number; exact: boolean };

describe.skipIf(!live)("count_number_roles (anon)", () => {
  it("scopes the role counts to the scripture filter", async () => {
    const db = anonDb();
    const all = await db.rpc("count_number_roles", { p_value: 1 });
    const dasam = await db.rpc("count_number_roles", { p_value: 1, p_sources: [DASAM] });
    expect(all.error).toBeNull();
    expect(dasam.error).toBeNull();
    const count = (rows: Role[], role: string) => Number(rows.find((r) => r.role === role)?.line_count);
    // ਮਹਲਾ ੧ is an SGGS heading: hundreds overall, none in Dasam Bani.
    expect(count(all.data as Role[], "author")).toBeGreaterThan(500);
    expect(count(dasam.data as Role[], "author")).toBe(0);
    expect((dasam.data as Role[]).map((r) => r.role)).toEqual(["author", "ghar", "heading_other", "verse_marker"]);
  });
});

describe.skipIf(!live)("count_lines_fuzzy (anon)", () => {
  it("counts what search_lines_fuzzy pages through", async () => {
    const db = anonDb();
    const t0 = Date.now();
    const { data, error } = await db.rpc("count_lines_fuzzy", { p_query: "ਵਾਹਗੁਰੂ", p_level: 3, p_sources: [SGGS, DASAM] });
    expect(error).toBeNull();
    expect(Date.now() - t0).toBeLessThan(3000);
    const page = await db.rpc("search_lines_fuzzy", {
      p_query: "ਵਾਹਗੁਰੂ", p_level: 3, p_sources: [SGGS, DASAM], p_limit: 1000, p_offset: 0,
    });
    expect(page.error).toBeNull();
    expect(Number(data)).toBe((page.data as unknown[]).length);
  });

  it("stops at the cap", async () => {
    const { data, error } = await anonDb().rpc("count_lines_fuzzy", { p_query: "ਹ", p_level: 1, p_cap: 500 });
    expect(error).toBeNull();
    expect(Number(data)).toBe(500);
  });
});

describe.skipIf(!live)("search_words_filtered (anon)", () => {
  it("counts frequency inside the selected scripture", async () => {
    const db = anonDb();
    const sggs = await db.rpc("search_words_filtered", { p_query: "ਨਾਮੁ", p_sources: [SGGS], p_limit: 1 });
    const all = await db.rpc("search_words_filtered", { p_query: "ਨਾਮੁ", p_limit: 1 });
    expect(sggs.error).toBeNull();
    const [s] = sggs.data as WordHit[];
    const [a] = all.data as WordHit[];
    expect(s.gurmukhi).toBe("ਨਾਮੁ");
    expect(s.frequency).toBeGreaterThan(0);
    expect(s.frequency).toBeLessThan(a.frequency);
  });

  it("returns only words the selected writer used", async () => {
    const db = anonDb();
    const { data, error } = await db.rpc("search_words_filtered", {
      p_query: "ਪ੍ਰਭ", p_writers: ["Guru Arjan Dev Ji"], p_limit: 10,
    });
    expect(error).toBeNull();
    const ids = (data as WordHit[]).map((w) => w.id);
    expect(ids.length).toBeGreaterThan(0);
    const { data: rows } = await db
      .from("word_corpus_writer_stats")
      .select("word_id")
      .in("word_id", ids)
      .eq("writer_english", "Guru Arjan Dev Ji");
    expect(new Set((rows ?? []).map((r) => r.word_id))).toEqual(new Set(ids));
  });

  it("treats % and _ in the query as text, not wildcards", async () => {
    const { data, error } = await anonDb().rpc("search_words_filtered", { p_query: "%" });
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});
