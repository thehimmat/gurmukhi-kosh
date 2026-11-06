import { describe, it, expect, vi } from "vitest";

// /admin/padarth is the curator's: without the admin cookie (or ?key=ADMIN_KEY) it is a 404, and it never reads data.
const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});
vi.mock("next/navigation", () => ({ notFound: () => notFound() }));
// No admin cookie on these requests.
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
const curatorDb = vi.fn();
vi.mock("../lib/curator", async (orig) => ({
  ...(await orig<typeof import("../lib/curator")>()),
  curatorDb: (...a: unknown[]) => curatorDb(...a),
}));

describe("/admin/padarth", () => {
  it.each([[{}], [{ key: "wrong" }], [{ key: ["secret", "secret"] }]])("is a 404 for %j, before reading anything", async (params) => {
    vi.stubEnv("ADMIN_KEY", "secret");
    const { default: Page } = await import("../app/admin/padarth/page");
    await expect(Page({ searchParams: Promise.resolve(params) })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(curatorDb).not.toHaveBeenCalled();
  });
});
