/**
 * A spelling merge (issue #6) deletes a word and moves its definitions, grammar and etymology, so
 * it refreshes the /health totals (075). The refresh takes ~17 s, so it runs after the response
 * (next/server's after()), not inside the admin's request. A rename or "keep" changes no total.
 * Run: npm test
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const rpcCalls: string[] = [];
const scheduled: Array<() => unknown> = [];
let clashId: number | null = null;

// Every query resolves; only the two the action branches on return rows.
function fakeDb() {
  const chain = (table: string) => {
    // single(): the word under review; maybeSingle(): a word already spelled as corrected
    let one: "single" | "maybe" | null = null;
    const c = {
      select: () => c, eq: () => c, order: () => c, update: () => c, delete: () => c,
      single: () => { one = "single"; return c; },
      maybeSingle: () => { one = "maybe"; return c; },
      then(resolve: (r: { data: unknown; error: null }) => void) {
        const data = one === "single" ? { gurmukhi: "ਪੁਰਾਣਾ" }
          : one === "maybe" ? (table === "words" && clashId !== null ? { id: clashId } : null)
          : [];
        resolve({ data, error: null });
      },
    };
    return c;
  };
  return {
    from: chain,
    rpc(fn: string) { rpcCalls.push(fn); return Promise.resolve({ data: null, error: null }); },
  };
}

vi.mock("@/lib/supabase", () => ({ supabaseAdmin: () => fakeDb() }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/server", () => ({ after: (f: () => unknown) => { scheduled.push(f); } }));

const { submitSpellingReview } = await import("../app/admin/spellings/actions");

const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries({ key: "test-key", wordId: "1", ...fields })) f.set(k, v);
  return f;
};

beforeEach(() => {
  process.env.ADMIN_KEY = "test-key";
  rpcCalls.length = 0;
  scheduled.length = 0;
  clashId = null;
});

describe("submitSpellingReview and the /health totals", () => {
  it("refreshes them after a merge, once the response is sent", async () => {
    clashId = 2; // the corrected spelling already exists, so word 1 merges into word 2
    await submitSpellingReview(form({ decision: "correct", corrected: "ਨਵਾਂ" }));
    expect(rpcCalls).toEqual([]); // not inside the request
    expect(scheduled).toHaveLength(1);
    await scheduled[0]();
    expect(rpcCalls).toEqual(["refresh_health_stats"]);
  });

  it("leaves them alone for a rename or a keep", async () => {
    await submitSpellingReview(form({ decision: "correct", corrected: "ਨਵਾਂ" }));
    await submitSpellingReview(form({ decision: "keep" }));
    expect(scheduled).toEqual([]);
  });
});
