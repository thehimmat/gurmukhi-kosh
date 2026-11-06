/**
 * proxy.ts: the admin key leaves /admin URLs for an httpOnly cookie (tests/curator-cookie.test.ts
 * has the rules). Run: npm test
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { config, proxy } from "../proxy";

beforeEach(() => vi.stubEnv("ADMIN_KEY", "s3cret"));
afterEach(() => vi.unstubAllEnvs());

const req = (path: string) => new NextRequest(new URL(path, "https://kosh.internal"));

describe("proxy", () => {
  it("redirects an /admin page to its URL without the key, setting the cookie", () => {
    const res = proxy(req("/admin/padarth?key=s3cret&bani=2&p=4"));
    expect(res.status).toBe(303);
    // Absolute here; Next relativizes a same-origin Location before it leaves the server.
    expect(res.headers.get("location")).toBe("https://kosh.internal/admin/padarth?bani=2&p=4");
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(/^kosh_admin=s3cret;/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Path=\/admin/);
  });

  it("passes a /word page through with the key, setting the cookie", () => {
    const res = proxy(req("/word/x?key=s3cret"));
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("x-middleware-next")).toBe("1");
    expect(res.headers.get("set-cookie")).toMatch(/^kosh_admin=s3cret;/);
  });

  it("passes a wrong key through untouched, so the page answers 404", () => {
    const res = proxy(req("/admin/padarth?key=nope"));
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("runs only on /admin and /word", () => {
    expect(config.matcher).toEqual(["/admin/:path*", "/word/:path*"]);
  });
});
