/**
 * The admin key travels in an httpOnly cookie scoped to /admin (#23 status: "Admin key in an
 * httpOnly cookie, so it stops appearing in URLs, logs and server-action arguments"). Opening any
 * /admin page with ?key=ADMIN_KEY swaps the key for the cookie and redirects to the same URL
 * without it. A /word page opened with the key keeps it in its URL (the CDN caches /word by URL,
 * next.config.ts) but also sets the cookie, so its links into /admin work without the key.
 * Run: npm test
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_COOKIE, adminCookieOptions, adminKeyExchange } from "../lib/curator";

beforeEach(() => vi.stubEnv("ADMIN_KEY", "s3cret"));
afterEach(() => vi.unstubAllEnvs());

const q = (s: string) => new URLSearchParams(s);

describe("adminKeyExchange", () => {
  it("swaps a valid key on an /admin page for the cookie, keeping the rest of the query", () => {
    expect(adminKeyExchange("/admin/padarth", q("bani=2&key=s3cret&p=4"))).toEqual({ setCookie: true, redirectTo: "/admin/padarth?bani=2&p=4" });
    expect(adminKeyExchange("/admin/flags", q("key=s3cret"))).toEqual({ setCookie: true, redirectTo: "/admin/flags" });
  });

  it("sets the cookie from a /word page but leaves its URL alone", () => {
    expect(adminKeyExchange("/word/ਨਾਮੁ", q("tab=usage&key=s3cret"))).toEqual({ setCookie: true, redirectTo: null });
  });

  it("does nothing for a missing, wrong or repeated key", () => {
    const none = { setCookie: false, redirectTo: null };
    expect(adminKeyExchange("/admin/padarth", q("bani=2"))).toEqual(none);
    expect(adminKeyExchange("/admin/padarth", q("key=nope"))).toEqual(none);
    expect(adminKeyExchange("/admin/padarth", q("key=s3cret&key=s3cret"))).toEqual(none);
  });

  it("does nothing when ADMIN_KEY is unset", () => {
    vi.stubEnv("ADMIN_KEY", "");
    expect(adminKeyExchange("/admin/padarth", q("key="))).toEqual({ setCookie: false, redirectTo: null });
  });
});

describe("the admin cookie", () => {
  it("is httpOnly, limited to /admin, and not sent cross-site", () => {
    expect(ADMIN_COOKIE).toMatch(/^[a-z_]+$/);
    expect(adminCookieOptions()).toMatchObject({ httpOnly: true, path: "/admin", sameSite: "lax" });
    expect(adminCookieOptions().maxAge).toBeGreaterThan(0);
  });

  it("is Secure in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(adminCookieOptions().secure).toBe(true);
  });
});

// The session helpers read the cookie through next/headers.
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined) }) }));

describe("adminKey / requireAdmin", () => {
  beforeEach(() => jar.clear());

  it("reads the key from the cookie, and only a valid one", async () => {
    const { adminKey } = await import("../lib/curator-session");
    expect(await adminKey()).toBeNull();
    jar.set(ADMIN_COOKIE, "nope");
    expect(await adminKey()).toBeNull();
    jar.set(ADMIN_COOKIE, "s3cret");
    expect(await adminKey()).toBe("s3cret");
  });

  it("still accepts a valid ?key when there is no cookie (the proxy normally swaps it first)", async () => {
    const { adminKey } = await import("../lib/curator-session");
    expect(await adminKey("s3cret")).toBe("s3cret");
    expect(await adminKey(["s3cret"])).toBeNull();
    expect(await adminKey("nope")).toBeNull();
  });

  it("lets a server action through only with the cookie, never an argument", async () => {
    const { requireAdmin } = await import("../lib/curator-session");
    await expect(requireAdmin()).rejects.toThrow("Unauthorized");
    jar.set(ADMIN_COOKIE, "s3cret");
    await expect(requireAdmin()).resolves.toBeUndefined();
  });
});
