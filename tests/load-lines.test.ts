/**
 * pipeline/shared/load-lines.ts: linesLoadSql's twin over the REST API, for loading a built corpus
 * with the service key when raw SQL can't reach the database. Run against an in-memory stand-in for
 * the three tables, keyed and de-duplicated as Postgres keys them.
 */
import { describe, it, expect } from "vitest";
import { loadLines, type LoadDb } from "../pipeline/shared/load-lines";
import { linesLoadSql, type LoadLine } from "../pipeline/shared/load-sql";

type Row = Record<string, unknown>;

/** Tables with the unique keys the loader relies on; ids are handed out in insert order. */
function fakeDb(pageCap = 1000) {
  const keys: Record<string, (r: Row) => string> = {
    lines: (r) => `${r.source_fk}:${r.verse_id}`,
    words: (r) => String(r.gurmukhi),
    word_occurrences: (r) => `${r.word_id}:${r.line_id}:${r.position}`,
  };
  const tables: Record<string, Row[]> = { sources: [{ id: 7, code: "test_src" }], lines: [], words: [], word_occurrences: [] };
  const calls: { table: string; op: string; size: number }[] = [];
  let nextId = 1;

  const db: LoadDb = {
    from(table: string) {
      const filters: ((r: Row) => boolean)[] = [];
      const q = {
        select() {
          return q;
        },
        eq(col: string, v: unknown) {
          filters.push((r) => r[col] === v);
          return q;
        },
        in(col: string, vs: unknown[]) {
          filters.push((r) => vs.includes(r[col]));
          return q;
        },
        order() {
          return q;
        },
        async range(from: number, to: number) {
          calls.push({ table, op: "select", size: to - from + 1 });
          const all = tables[table].filter((r) => filters.every((f) => f(r)));
          return { data: all.slice(from, Math.min(to + 1, from + pageCap)), error: null };
        },
        async single() {
          const r = tables[table].find((x) => filters.every((f) => f(x)));
          return { data: r ?? null, error: r ? null : { message: "not found" } };
        },
        async upsert(rows: Row[]) {
          calls.push({ table, op: "upsert", size: rows.length });
          const key = keys[table];
          const seen = new Set(tables[table].map(key));
          for (const r of rows) {
            if (seen.has(key(r))) continue;
            seen.add(key(r));
            tables[table].push({ id: nextId++, ...r });
          }
          return { error: null };
        },
      };
      return q;
    },
  };
  return { db, tables, calls };
}

const lines: LoadLine[] = [
  { verse_id: 1, ang: 2, line_no: 1, shabad_id: 990001, gurmukhi: "ਸਤਿ ਨਾਮੁ ਕਰਤਾ ॥" },
  { verse_id: 2, ang: 2, line_no: 2, shabad_id: 990001, gurmukhi: "ਸਤਿ ਗੁਰ, ਪ੍ਰਸਾਦਿ ॥੧॥" },
];
const noCommas = (l: string) => l.replaceAll(",", "");

describe("loadLines", () => {
  it("loads the lines, their words and every occurrence in position order", async () => {
    const { db, tables } = fakeDb();
    const result = await loadLines(db, "test_src", lines, noCommas);
    expect(tables.lines.map((l) => [l.source_fk, l.verse_id, l.ang, l.line_no, l.shabad_id, l.gurmukhi])).toEqual([
      [7, 1, 2, 1, 990001, "ਸਤਿ ਨਾਮੁ ਕਰਤਾ ॥"],
      [7, 2, 2, 2, 990001, "ਸਤਿ ਗੁਰ, ਪ੍ਰਸਾਦਿ ॥੧॥"],
    ]);
    expect(tables.words.map((w) => w.gurmukhi)).toEqual(["ਸਤਿ", "ਨਾਮੁ", "ਕਰਤਾ", "ਗੁਰ", "ਪ੍ਰਸਾਦਿ"]);
    expect(tables.words.every((w) => w.frequency === 0)).toBe(true);
    const word = (id: unknown) => tables.words.find((w) => w.id === id)!.gurmukhi;
    const verse = (id: unknown) => tables.lines.find((l) => l.id === id)!.verse_id;
    expect(tables.word_occurrences.map((o) => [verse(o.line_id), o.position, word(o.word_id)])).toEqual([
      [1, 0, "ਸਤਿ"], [1, 1, "ਨਾਮੁ"], [1, 2, "ਕਰਤਾ"],
      [2, 0, "ਸਤਿ"], [2, 1, "ਗੁਰ"], [2, 2, "ਪ੍ਰਸਾਦਿ"],
    ]);
    expect(result).toEqual({ lines: 2, words: 5, occurrences: 6 });
  });

  it("counts what linesLoadSql counts", async () => {
    const { db } = fakeDb();
    const result = await loadLines(db, "test_src", lines, noCommas);
    const sql = linesLoadSql("test_src", lines, noCommas);
    expect([result.occurrences, result.words]).toEqual([sql.tokens, sql.distinct]);
  });

  it("is a no-op when re-run, like the SQL load", async () => {
    const { db, tables } = fakeDb();
    await loadLines(db, "test_src", lines, noCommas);
    await loadLines(db, "test_src", lines, noCommas);
    expect([tables.lines.length, tables.words.length, tables.word_occurrences.length]).toEqual([2, 5, 6]);
  });

  it("reuses a word another corpus already has", async () => {
    const { db, tables } = fakeDb();
    tables.words.push({ id: 500, gurmukhi: "ਸਤਿ", frequency: 900 });
    await loadLines(db, "test_src", lines, noCommas);
    expect(tables.words.filter((w) => w.gurmukhi === "ਸਤਿ")).toEqual([{ id: 500, gurmukhi: "ਸਤਿ", frequency: 900 }]);
    expect(tables.word_occurrences.filter((o) => o.word_id === 500)).toHaveLength(2);
  });

  it("writes in batches and reads back past PostgREST's 1,000-row cap", async () => {
    const many: LoadLine[] = Array.from({ length: 2500 }, (_, i) => ({
      verse_id: i + 1, ang: 1, line_no: i + 1, shabad_id: 990001, gurmukhi: "ਸਤਿ ਨਾਮੁ ॥",
    }));
    const { db, tables, calls } = fakeDb();
    const result = await loadLines(db, "test_src", many);
    expect(tables.lines).toHaveLength(2500);
    expect(result.occurrences).toBe(tables.word_occurrences.length);
    expect(Math.max(...calls.filter((c) => c.op === "upsert").map((c) => c.size))).toBeLessThanOrEqual(500);
  });

  it("refuses a source that isn't registered", async () => {
    const { db } = fakeDb();
    await expect(loadLines(db, "no_such_source", lines)).rejects.toThrow(/no_such_source/);
  });
});
