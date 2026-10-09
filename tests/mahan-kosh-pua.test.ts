/**
 * Live-DB check that Mahan Kosh text carries no Private Use Area glyphs from
 * the scraped source's font (#150). They render as boxes in every font.
 *
 * Only code points pua_map.json lists as unresolved may remain; everything
 * else is mapped by pipeline/mahan-kosh/normalize.py before ingest.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";
import puaMap from "../pipeline/mahan-kosh/pua_map.json";

const PUA_CLASS = `[${String.fromCodePoint(0xe000)}-${String.fromCodePoint(0xf8ff)}]`;
const PUA_GLOBAL = new RegExp(PUA_CLASS, "gu");

const cp = (ch: string) => `U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}`;

const unresolved = new Set(
  Object.entries(puaMap.code_points)
    .filter(([, e]) => e.status === "unresolved")
    .map(([key]) => key)
);

describe("Mahan Kosh Private Use Area glyphs (#150)", () => {
  it("every code point in the map is either mapped or explicitly unresolved", () => {
    for (const [key, e] of Object.entries(puaMap.code_points)) {
      expect(key).toMatch(/^U\+F[0-9A-F]{3}$/);
      expect(["mark", "reph", "char", "unresolved"]).toContain(e.kind);
      expect(e.kind === "unresolved").toBe(e.status === "unresolved");
    }
  });

  it("no definition row contains a mapped PUA code point", async () => {
    const db = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    // Once the text is clean the regex scans every Mahan Kosh row with no
    // early exit, under the anon role's 3 s statement timeout. Filter on
    // dict_source_id directly (as lib/health.ts does) rather than through an
    // embedded dict_sources join, to keep the plan simple. The first run after
    // the re-ingest timed out while autovacuum cleared the rewritten rows.
    const { data: src, error: srcError } = await db
      .from("dict_sources")
      .select("id")
      .eq("code", "mahan_kosh")
      .single();
    expect(srcError).toBeNull();
    const { data, error } = await db
      .from("definitions")
      .select("id, sense_number, definition_text")
      .eq("dict_source_id", src!.id)
      .filter("definition_text", "match", PUA_CLASS)
      .limit(200);
    expect(error).toBeNull();

    const rows = (data ?? []) as { id: number; sense_number: number; definition_text: string }[];
    const offenders = rows.flatMap((row) =>
      [...new Set((row.definition_text.match(PUA_GLOBAL) ?? []).map(cp))]
        .filter((c) => !unresolved.has(c))
        .map((c) => `definitions#${row.id} sense ${row.sense_number}: ${c}`)
    );
    expect(offenders).toEqual([]);
  }, 30_000);
});
