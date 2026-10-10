/**
 * The Shackle reset must not try to delete words a corpus now attests.
 * 2026-10-07: the Sarbloh ingest attached occurrences to 364 off-corpus
 * lemmas Shackle had created; the wipe's blanket delete then hit the
 * word_occurrences FK and aborted after the definitions were already gone.
 *
 * Form links (#18) are cleared first: a hub can be rooted on an off-corpus
 * lemma, and lexemes.root_word_id does not cascade.
 * Run: npm test
 */

import { describe, it, expect } from "vitest";
import { wipeFormLinks, wipeSource } from "../pipeline/shackle/wipe";

type Row = Record<string, unknown>;
type Filter = [op: "eq" | "in", col: string, val: unknown];
type Call = { table: string; op: "select" | "delete"; filters: Filter[] };

/** In-memory stand-in for the supabase-js subset the wipe uses. */
function fakeDb(tables: Record<string, Row[]>, calls: Call[] = []) {
  const match = (row: Row, filters: Filter[]) =>
    filters.every(([op, col, val]) => (op === "eq" ? row[col] === val : (val as unknown[]).includes(row[col])));
  return {
    from(table: string) {
      const rows = (tables[table] ??= []);
      const chain = (op: Call["op"]) => {
        const call: Call = { table, op, filters: [] };
        calls.push(call);
        const run = () => {
          const hit = rows.filter((r) => match(r, call.filters));
          if (op === "delete") tables[table] = rows.filter((r) => !hit.includes(r));
          return hit;
        };
        const c = {
          eq(col: string, val: unknown) { call.filters.push(["eq", col, val]); return c; },
          in(col: string, val: unknown[]) { call.filters.push(["in", col, val]); return c; },
          order() { return c; },
          range(from: number, to: number) { return Promise.resolve({ data: run().slice(from, to + 1), error: null }); },
          then(resolve: (r: { data: Row[]; error: null }) => void) { resolve({ data: run(), error: null }); },
        };
        return c;
      };
      return { select: () => chain("select"), delete: () => chain("delete") };
    },
  };
}

describe("wipeFormLinks", () => {
  const tables = () => ({
    lexemes: [{ id: 1, root_word_id: 10 }, { id: 2, root_word_id: 20 }, { id: 3, root_word_id: 30 }],
    lexeme_citations: [
      { lexeme_id: 1, source_code: "shackle" },
      { lexeme_id: 2, source_code: "shackle" },
      { lexeme_id: 2, source_code: "manual" },
      { lexeme_id: 3, source_code: "manual" },
    ],
    word_forms: [
      { id: 1, lexeme_id: 1, source_code: "shackle" },
      { id: 2, lexeme_id: 2, source_code: "shackle" },
      { id: 3, lexeme_id: 3, source_code: "manual" },
    ],
    lexeme_relations: [],
  });

  it("deletes the source's memberships and citations, and only the hubs it leaves empty", async () => {
    const t = tables();
    await wipeFormLinks(fakeDb(t) as never, "shackle");
    expect(t.word_forms.map((r) => r.id)).toEqual([3]);
    expect(t.lexeme_citations).toEqual([
      { lexeme_id: 2, source_code: "manual" },
      { lexeme_id: 3, source_code: "manual" },
    ]);
    // Hub 2 is shared with another source's citation; hub 3 was never Shackle's.
    expect(t.lexemes.map((r) => r.id)).toEqual([2, 3]);
  });

  it("is a no-op the second time", async () => {
    const t = tables();
    await wipeFormLinks(fakeDb(t) as never, "shackle");
    await wipeFormLinks(fakeDb(t) as never, "shackle");
    expect(t.lexemes.map((r) => r.id)).toEqual([2, 3]);
  });
});

describe("wipeSource", () => {
  it("deletes only the off-corpus words this source created", async () => {
    const calls: Call[] = [];
    await wipeSource(fakeDb({}, calls) as never, 4, "shackle");
    const words = calls.find((c) => c.table === "words")!;
    expect(words.filters).toEqual([
      ["eq", "origin_source", "shackle"],
      ["eq", "in_corpus", false],
    ]);
  });

  it("clears form links, then the source's own rows, before the words", async () => {
    const calls: Call[] = [];
    await wipeSource(fakeDb({}, calls) as never, 4, "shackle");
    const deletes = calls.filter((c) => c.op === "delete").map((c) => c.table);
    expect(deletes).toEqual([
      "word_forms", "lexeme_citations", "lexeme_relations",
      "dict_examples", "word_grammar", "etymology", "definitions", "words",
    ]);
  });
});
