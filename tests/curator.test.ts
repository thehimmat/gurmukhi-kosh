/**
 * Curator mode (#125): curation tooling on public pages shows only when the
 * page is opened with ?key=ADMIN_KEY, the same key /admin/* already checks.
 * Run: npm test
 */

import { afterEach, describe, expect, it } from "vitest";
import { isCurator, withCuratorKey } from "../lib/curator";

const ORIGINAL = process.env.ADMIN_KEY;
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.ADMIN_KEY;
  else process.env.ADMIN_KEY = ORIGINAL;
});

describe("isCurator", () => {
  it("is false when ADMIN_KEY is unset, even for an empty key", () => {
    delete process.env.ADMIN_KEY;
    expect(isCurator(undefined)).toBe(false);
    expect(isCurator("")).toBe(false);
  });

  it("is false for a missing or wrong key", () => {
    process.env.ADMIN_KEY = "s3cret";
    expect(isCurator(undefined)).toBe(false);
    expect(isCurator("nope")).toBe(false);
  });

  it("is true only for the exact key", () => {
    process.env.ADMIN_KEY = "s3cret";
    expect(isCurator("s3cret")).toBe(true);
  });
});

describe("withCuratorKey", () => {
  it("leaves the href alone outside curator mode", () => {
    expect(withCuratorKey("/word/ਨਾਮੁ?tab=usage", null)).toBe("/word/ਨਾਮੁ?tab=usage");
  });

  it("appends the key to an existing query", () => {
    expect(withCuratorKey("/word/x?tab=usage", "a b&c")).toBe("/word/x?tab=usage&key=a%20b%26c");
  });

  it("starts a query when there is none", () => {
    expect(withCuratorKey("/admin/flags", "k")).toBe("/admin/flags?key=k");
  });
});
