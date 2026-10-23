/**
 * Migration 074: drops indexes another index already serves, or that no query can use, to bring
 * the database down toward Supabase Free's 500 MB. The covering and leading-column indexes that
 * take over their queries stay.
 */
import { describe, it, expect, beforeAll } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { applyFrom, freshDb } from "./replay";

const M = "074_trim_indexes.sql";

const DROPPED = [
  "lines_first_letters_cover", //       superseded by lines_first_letters_cover_public (070)
  "word_occurrences_word_id", //        leading column of word_occurrences_unique
  "line_translations_line_id", //       leading column of line_translations_line_id_source_code_key
  "words_phonetic_ipa_trgm", //         search_words_phonetic's predicate can't use it
  "word_occurrences_position_word", //  its only caller, the per-position branch, went in 051
];

// What takes over, plus the fuzzy Dictionary indexes the migration keeps on purpose.
const KEPT = [
  "lines_first_letters_cover_public",
  "word_occurrences_unique",
  "word_occurrences_line_id",
  "line_translations_line_id_source_code_key",
  "words_gurmukhi_fold1",
  "words_gurmukhi_fold2",
  "words_gurmukhi_fold2_trgm",
];

const indexes = async (d: PGlite) =>
  (await d.query<{ indexname: string }>("select indexname from pg_indexes where schemaname = 'public'"))
    .rows.map((r) => r.indexname);

async function plan(d: PGlite, sql: string): Promise<string> {
  await d.exec("set enable_seqscan = off");
  const r = await d.query<{ "QUERY PLAN": string }>(`explain ${sql}`);
  await d.exec("reset enable_seqscan");
  return r.rows.map((x) => x["QUERY PLAN"]).join("\n");
}

let db: PGlite;
let before: string[];
beforeAll(async () => {
  db = await freshDb({ before: M });
  before = await indexes(db);
  await applyFrom(db, M);
});

describe("074 trim indexes", () => {
  it("starts from a replay that has every index it drops", () => {
    expect(before).toEqual(expect.arrayContaining([...DROPPED, ...KEPT]));
  });

  it("drops the redundant and unusable indexes", async () => {
    const after = await indexes(db);
    for (const name of DROPPED) expect(after).not.toContain(name);
  });

  it("keeps the indexes that take over, and the fuzzy Dictionary ones", async () => {
    expect(await indexes(db)).toEqual(expect.arrayContaining(KEPT));
  });

  it("serves the dropped indexes' lookups from the kept ones", async () => {
    expect(await plan(db, "select line_id from word_occurrences where word_id = 1"))
      .toContain("word_occurrences_unique");
    expect(await plan(db, "select source_code from line_translations where line_id = 1"))
      .toContain("line_translations_line_id_source_code_key");
    expect(await plan(db, "select id from lines where first_letters like 'ਸਨਕਪ%'"))
      .toContain("lines_first_letters_cover_public");
  });

  it("is idempotent", async () => {
    await expect(applyFrom(db, M)).resolves.toBeUndefined();
  });
});
