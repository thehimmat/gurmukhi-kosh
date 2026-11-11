/**
 * The apps on the VM: both Next servers run as standalone Docker images from thehimmat/atthebunga-server,
 * next to this repo's database stack (selfhost/), reached through Cloudflare. Off Vercel Hobby after the Oct 2026
 * pause (crawlers on /word, /line, /ang used most of the Fluid CPU allowance).
 * Run: npm test
 */

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import nextConfig from "../next.config";
import { supabaseAnonKey, supabaseUrl } from "../lib/supabase";
import { cloudflareBlock, prodBase } from "./stories/helpers";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

afterEach(() => vi.unstubAllEnvs());

describe("database URL", () => {
  it("prefers the runtime SUPABASE_URL, so on the VM the server talks to the gateway over Docker's network", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://api.example.org");
    vi.stubEnv("SUPABASE_URL", "http://gateway:8080");
    expect(supabaseUrl()).toBe("http://gateway:8080");
  });

  it("falls back to the public URL (Vercel, CI, local dev)", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://api.example.org");
    vi.stubEnv("SUPABASE_URL", "");
    expect(supabaseUrl()).toBe("https://api.example.org");
  });

  it("reads the anon key at runtime too, falling back to the inlined one", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "built-in");
    vi.stubEnv("SUPABASE_ANON_KEY", "");
    expect(supabaseAnonKey()).toBe("built-in");
    vi.stubEnv("SUPABASE_ANON_KEY", "rotated");
    expect(supabaseAnonKey()).toBe("rotated");
  });
});

describe("standalone build", () => {
  it("emits a standalone server for the Docker image", () => {
    expect(nextConfig.output).toBe("standalone");
  });
});

describe("gurmukhi-kosh.vercel.app after the move", () => {
  async function vercelHostRedirect() {
    const rules = (await nextConfig.redirects?.()) ?? [];
    return rules.find((r) => r.has?.some((h) => h.type === "host" && h.value === "gurmukhi-kosh.vercel.app"));
  }

  it("is left alone by default, so the Vercel deployment stays a working rollback target", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("KOSH_REDIRECT_VERCEL_HOST", "");
    expect(await vercelHostRedirect()).toBeUndefined();
  });

  it("308s to search.atthebunga.com when KOSH_REDIRECT_VERCEL_HOST=1 in Vercel production", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("KOSH_REDIRECT_VERCEL_HOST", "1");
    const rule = await vercelHostRedirect();
    expect(rule).toMatchObject({ source: "/:path*", destination: "https://search.atthebunga.com/:path*", permanent: true });
  });

  it("never redirects outside Vercel production (previews, the VM)", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("KOSH_REDIRECT_VERCEL_HOST", "1");
    expect(await vercelHostRedirect()).toBeUndefined();
  });

  it("has no Vercel cron: the daily /api/health call moved to .github/workflows/uptime.yml", () => {
    expect(JSON.parse(read("vercel.json")).crons).toBeUndefined();
    expect(read(".github/workflows/uptime.yml")).toMatch(/\/api\/health/);
  });
});

describe("production checks", () => {
  it("target the public site by default", () => {
    vi.stubEnv("PROD_BASE_URL", "");
    expect(prodBase()).toBe("https://search.atthebunga.com");
  });

  it("can point at another origin (a Vercel deployment during a rollback)", () => {
    vi.stubEnv("PROD_BASE_URL", "https://gurmukhi-kosh.vercel.app/");
    expect(prodBase()).toBe("https://gurmukhi-kosh.vercel.app");
  });
});

describe("production checks through Cloudflare", () => {
  it("name Cloudflare's reason when it blocks or challenges the check, not just a 403", async () => {
    const challenged = new Response("<html><title>Just a moment...</title></html>", {
      status: 403,
      headers: { server: "cloudflare", "cf-mitigated": "challenge", "cf-ray": "abc-IAD" },
    });
    expect(await cloudflareBlock(challenged)).toBe(
      'Cloudflare answered 403 (cf-mitigated: challenge, ray abc-IAD, "Just a moment..."), so the check never reached the app'
    );
  });

  it("let the app's own responses through, including its 4xx", async () => {
    expect(await cloudflareBlock(new Response("{}", { status: 400, headers: { server: "cloudflare" } }))).toBeNull();
    expect(await cloudflareBlock(new Response("ok", { status: 200 }))).toBeNull();
  });
});

// The gateway, the apps and their Caddy config moved to thehimmat/atthebunga-server (#395), which
// tests them itself. What stays here is the database's side of the contract with it.
describe("selfhost/docker-compose.yml (the database: Postgres and PostgREST)", () => {
  const compose = read("selfhost/docker-compose.yml");

  it("pins the project name, so the volume stays selfhost_pgdata whatever the folder is called", () => {
    expect(compose).toMatch(/^name: selfhost$/m);
  });

  it("runs only the database and PostgREST; the gateway and the apps are atthebunga-server's", () => {
    const services = /^services:\n([\s\S]*?)^\S/m.exec(compose)?.[1] ?? "";
    expect(services.match(/^ {2}[a-z-]+:$/gm)).toEqual(["  db:", "  rest:"]);
  });

  it("shares only PostgREST with the gateway, on the external api-edge network", () => {
    expect(compose).toMatch(/^ {2}rest:\n(?: {4}.*\n)*? {4}networks: \[default, api-edge\]$/m);
    expect(compose).toMatch(/^networks:\n {2}api-edge:\n {4}name: api-edge\n {4}external: true$/m);
    const uses = compose.split("\n").filter((l) => /\bapi-edge\b/.test(l) && !l.trimStart().startsWith("#"));
    expect(uses).toHaveLength(3);
  });

  it("leaves Caddy's certificate volume (now atthebunga-server's) undeclared, so `down -v` here can't delete it", () => {
    const yaml = compose.split("\n").filter((l) => !l.trimStart().startsWith("#")).join("\n");
    expect(yaml).not.toMatch(/caddy_data/);
  });
});

describe("the server scripts after the split", () => {
  it("db-setup.sh drops the old COMPOSE_FILE, which names compose files that are gone", () => {
    expect(read("selfhost/scripts/db-setup.sh")).toContain("sed -i '/^COMPOSE_FILE=/d; /^GATEWAY_PORTS=/d'");
  });

  it("rotate-service-key.sh recreates the gateway and kosh in atthebunga-server's project", () => {
    expect(read("selfhost/scripts/rotate-service-key.sh")).toMatch(
      /sh "\$\{INFRA_DIR:-\/opt\/infra\}\/scripts\/compose\.sh" up -d gateway kosh/
    );
  });

  it("check.sh trusts the root-run container's mount, so the tests that call git pass on the VM (#401)", () => {
    expect(read("selfhost/scripts/check.sh")).toMatch(
      /node:22 sh -c 'git config --global --add safe\.directory \/app && npm ci/
    );
  });

  // The dump (public/akhar/supabase_migrations) doesn't carry the pg_trgm extension, so a restore into
  // a database that lacks it fails on the 6 trigram indexes (#422).
  it("restore.sh creates pg_trgm before pg_restore", () => {
    const s = read("selfhost/scripts/restore.sh");
    const ext = s.indexOf("create extension if not exists pg_trgm with schema public");
    expect(ext).toBeGreaterThan(-1);
    expect(ext).toBeLessThan(s.indexOf("pg_restore -U postgres"));
  });

  it("the restore docs say to create pg_trgm first in a fresh database", () => {
    for (const doc of ["supabase/BACKUP.md", "selfhost/README.md"]) {
      expect(read(doc)).toContain("create extension pg_trgm with schema public");
    }
  });

  it("deploys with atthebunga-server's targets: kosh for a new image, kosh-db otherwise", () => {
    expect(read(".github/workflows/deploy.yml")).toContain(
      "TARGET: ${{ needs.image.outputs.built == 'true' && 'kosh' || 'kosh-db' }}"
    );
  });
});
