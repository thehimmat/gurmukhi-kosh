/**
 * Curator mode (#125): curation tooling on public pages shows only when the
 * page is opened with ?key=ADMIN_KEY, the same key /admin/* already checks.
 * Run: npm test
 */

import { afterEach, describe, expect, it } from "vitest";
import { curatorDb, isCurator, publicOriginFilter, withCuratorKey } from "../lib/curator";
import { supabase } from "../lib/supabase";

const ORIGINAL = process.env.ADMIN_KEY;
const ORIGINAL_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.ADMIN_KEY;
  else process.env.ADMIN_KEY = ORIGINAL;
  if (ORIGINAL_SERVICE === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = ORIGINAL_SERVICE;
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

// Curator-only sources (#258, migration 069): RLS hides them from the anon key, so curator mode
// reads through the service role. Server-side only: the pages and routes that call this never
// send the client to the browser.
describe("curatorDb", () => {
  it("is the public (anon) client outside curator mode", () => {
    expect(Object.is(curatorDb(false), supabase)).toBe(true);
  });

  it("is a service-role client in curator mode", () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
    process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://localhost:54321";
    expect(Object.is(curatorDb(true), supabase)).toBe(false);
  });

  it("fails loudly in curator mode without a service key, never falling back to anon", () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(() => curatorDb(true)).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });
});

// Off-corpus words added because a curator-only source lists them (words.origin_source, e.g.
// Shackle's appendix headwords) stay out of public listings. The words table itself keeps a `true`
// policy so its search indexes keep working (migration 069), so the filter is applied in the query.
describe("publicOriginFilter", () => {
  it("keeps corpus words, unsourced words, and words from public sources", () => {
    expect(publicOriginFilter(["mahan_kosh", "manual"])).toBe(
      "in_corpus.eq.true,origin_source.is.null,origin_source.in.(mahan_kosh,manual)",
    );
  });

  it("drops the origin clause when no source is public", () => {
    expect(publicOriginFilter([])).toBe("in_corpus.eq.true,origin_source.is.null");
  });

  it("refuses a code that could break out of the filter", () => {
    expect(() => publicOriginFilter(["mahan_kosh),id.gt.(0"])).toThrow(/source code/);
  });
});
