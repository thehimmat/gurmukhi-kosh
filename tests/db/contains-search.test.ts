/**
 * Migration 066: Contains search for gurmukhi-search, matched on the canonical
 * (NFD) spelling so a nukta letter is found whichever way it is stored, and so
 * a query of only marks (੍, ਼, "੍ ") never asks the trigram index for nothing.
 */
import { describe, it, expect, beforeAll } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshDb } from "./replay";
import { linesLoadSql, type LoadLine } from "../../pipeline/shared/load-sql";

// Spelled with escapes: an editor or tool that normalizes text would silently
// turn the ready-made letters (ਸ਼ U+0A36) into the two-part ones (ਸ + ਼).
const NUKTA = "਼";
const HALANT = "੍";
const SHA = "ਸ਼"; // ਸ਼ as one code point
const ZA = "ਜ਼"; // ਜ਼ as one code point
const KHA_SPLIT = "ਖ" + NUKTA; // ਖ਼ as ਖ + ਼
const DA_NUKTA_HALANT = "ਦ" + HALANT + NUKTA; // ਦ਼੍ stored halant-first, as in the corpus

const TEXTS = [
  `${SHA}ਬਦੁ ਗੁਰੂ`, // 1: ਸ਼ precomposed
  `ਸਬਦੁ ਗੁਰੂ`, // 2: plain ਸ
  `${KHA_SPLIT}ਾਲਿਕ ਸੋਰਠਾ`, // 3: ਖ਼ split
  `ਗੁਰ ਪ੍ਰਸਾਦਿ`, // 4: a conjunct, no nukta
  `ਜਨਿੰ${DA_NUKTA_HALANT} ਦਿਸ`, // 5: a word ending in halant
  `${ZA}ਮੀਨ`, // 6: ਜ਼ precomposed
  `100% ਸਚੁ`, // 7: LIKE metacharacters
];
const lines: LoadLine[] = TEXTS.map((gurmukhi, i) => ({ verse_id: i + 1, ang: 1, line_no: i + 1, shabad_id: null, gurmukhi }));

let db: PGlite;
beforeAll(async () => {
  db = await freshDb();
  await db.exec(linesLoadSql("sggs_banidb_v2", lines).sql);
  await db.exec("set role anon");
}, 60_000);

const hits = async (q: string) =>
  (await db.query<{ verse_id: number }>("select verse_id from search_lines_contains($1)", [q])).rows.map((r) => r.verse_id);
const count = async (q: string) =>
  Number((await db.query<{ n: number }>("select count_lines_contains($1) as n", [q])).rows[0].n);

describe("066: search_lines_contains", () => {
  it("finds a plain substring, in reading order", async () => {
    expect(await hits("ਗੁਰ")).toEqual([1, 2, 4]);
  });

  it("finds every nukta letter for a lone nukta, ready-made or two-part", async () => {
    expect(await hits(NUKTA)).toEqual([1, 3, 5, 6]);
  });

  it("finds a nukta letter whichever form the query and the line use", async () => {
    expect(await hits(SHA)).toEqual([1]);
    expect(await hits("ਸ" + NUKTA)).toEqual([1]);
    expect(await hits("ਖ਼ਾ")).toEqual([3]); // ਖ਼ਾ, split
    expect(await hits("ਖ਼ਾ")).toEqual([3]); // ਖ਼ਾ, ready-made
  });

  it("keeps a plain letter from matching its nukta form", async () => {
    expect(await hits("ਸਬ")).toEqual([2]);
    expect(await hits("ਜ")).toEqual([5]); // ਜਨਿੰ, not ਜ਼ਮੀਨ
  });

  it("finds conjuncts for a lone halant", async () => {
    expect(await hits(HALANT)).toEqual([4, 5]);
  });

  it("finds a word ending in halant for halant + space, stored order regardless", async () => {
    expect(await hits(`${HALANT} `)).toEqual([5]);
    expect(await hits(`${NUKTA}${HALANT} `)).toEqual([5]);
  });

  it("treats % and _ as themselves", async () => {
    expect(await hits("0%")).toEqual([7]);
    expect(await hits("_")).toEqual([]);
  });

  it("returns nothing for a blank query", async () => {
    expect(await hits("  ")).toEqual([]);
  });

  it("pages and filters like the other line RPCs", async () => {
    const { rows } = await db.query<{ verse_id: number }>(
      "select verse_id from search_lines_contains($1, p_sources => $2, p_limit => 1, p_offset => 1)",
      ["ਗੁਰ", [1]],
    );
    expect(rows.map((r) => r.verse_id)).toEqual([2]);
    const none = await db.query("select * from search_lines_contains($1, p_sources => $2)", ["ਗੁਰ", [3]]);
    expect(none.rows).toEqual([]);
  });

  it("counts the same lines it finds, up to the cap", async () => {
    expect(await count(NUKTA)).toBe(4);
    expect(await count(`${HALANT} `)).toBe(1);
    expect(await count("ਗੁਰ")).toBe(3);
    const capped = await db.query<{ n: number }>("select count_lines_contains($1, p_cap => 2) as n", ["ਗੁਰ"]);
    expect(Number(capped.rows[0].n)).toBe(2);
  });
});
