/**
 * The Shackle reset must not try to delete words a corpus now attests.
 * 2026-10-07: the Sarbloh ingest attached occurrences to 364 off-corpus
 * lemmas Shackle had created; the wipe's blanket delete then hit the
 * word_occurrences FK and aborted after the definitions were already gone.
 * Run: npm test
 */

import { describe, it, expect } from "vitest";
import { wipeSource } from "../pipeline/shackle/wipe";

type Call = { table: string; filters: [string, unknown][] };

function fakeDb(calls: Call[]) {
  return {
    from(table: string) {
      return {
        delete() {
          const call: Call = { table, filters: [] };
          calls.push(call);
          const chain = {
            eq(col: string, val: unknown) {
              call.filters.push([col, val]);
              return chain;
            },
            then(resolve: (r: { error: null }) => void) {
              resolve({ error: null });
            },
          };
          return chain;
        },
      };
    },
  };
}

describe("wipeSource", () => {
  it("deletes only the off-corpus words this source created", async () => {
    const calls: Call[] = [];
    await wipeSource(fakeDb(calls) as never, 4, "shackle");
    const words = calls.find((c) => c.table === "words")!;
    expect(words.filters).toEqual([
      ["origin_source", "shackle"],
      ["in_corpus", false],
    ]);
  });

  it("clears the source's own rows before the words", async () => {
    const calls: Call[] = [];
    await wipeSource(fakeDb(calls) as never, 4, "shackle");
    expect(calls.map((c) => c.table)).toEqual(["dict_examples", "word_grammar", "etymology", "definitions", "words"]);
  });
});
