import { describe, it, expect, vi } from "vitest";

// /admin/padarth/slides is the curator's: without the admin cookie it is a 404 and reads nothing.
const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});
vi.mock("next/navigation", () => ({ notFound: () => notFound() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
const curatorDb = vi.fn();
vi.mock("../lib/curator", async (orig) => ({ ...(await orig<typeof import("../lib/curator")>()), curatorDb: (...a: unknown[]) => curatorDb(...a) }));

describe("GET /admin/padarth/slides", () => {
  it("is a 404 without the admin cookie, before reading anything", async () => {
    vi.stubEnv("ADMIN_KEY", "secret");
    const { GET } = await import("../app/admin/padarth/slides/route");
    await expect(GET(new Request("https://kosh.internal/admin/padarth/slides?bani=2&p=4"))).rejects.toThrow("NEXT_NOT_FOUND");
    expect(curatorDb).not.toHaveBeenCalled();
  });
});
