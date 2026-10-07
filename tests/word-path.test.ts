/**
 * Helpers for the word page's not-found state (#126): which word was asked
 * for, and where to send the reader instead.
 * Run: npm test
 */

import { describe, it, expect } from "vitest";
import { gurbaniSearchHref, wordFromPath } from "../lib/word-path";

describe("wordFromPath", () => {
  it("decodes the word from /word/<encoded>", () => {
    expect(wordFromPath(`/word/${encodeURIComponent("ਹਉਮੈ")}`)).toBe("ਹਉਮੈ");
  });

  it("ignores a query string or trailing slash", () => {
    expect(wordFromPath(`/word/${encodeURIComponent("ਨਾਮੁ")}/?tab=usage`)).toBe("ਨਾਮੁ");
  });

  it("is null for any other path, or a malformed encoding", () => {
    expect(wordFromPath("/browse")).toBeNull();
    expect(wordFromPath("/word/%E0%A8")).toBeNull();
  });
});

describe("gurbaniSearchHref", () => {
  it("points the search shell's line search at the word", () => {
    expect(gurbaniSearchHref("ਹਉਮੈ")).toBe(`/?q=${encodeURIComponent("ਹਉਮੈ")}`);
  });
});
