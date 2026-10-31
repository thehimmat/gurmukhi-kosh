/**
 * The apps on the VM (selfhost/README.md, "The apps"): both Next servers run as standalone Docker
 * images next to the database stack, reached through Cloudflare. Off Vercel Hobby after the Oct 2026
 * pause (crawlers on /word, /line, /ang used most of the Fluid CPU allowance).
 * Run: npm test
 */

import { execFileSync } from "node:child_process";
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

describe("selfhost/docker-compose.apps.yml", () => {
  const compose = read("selfhost/docker-compose.apps.yml");

  it("runs both apps from GHCR images", () => {
    expect(compose).toMatch(/image: ghcr\.io\/thehimmat\/gurmukhi-kosh:/);
    expect(compose).toMatch(/image: ghcr\.io\/thehimmat\/gurmukhi-search:/);
  });

  it("points both at the gateway's internal listener, not the public URL", () => {
    expect(compose.match(/SUPABASE_URL: http:\/\/gateway:8080/g)).toHaveLength(2);
    expect(compose.match(/SUPABASE_ANON_KEY: \$\{ANON_KEY\}/g)).toHaveLength(2);
  });

  it("caps each app's memory so Postgres keeps its share of the 12 GB", () => {
    expect(compose).toMatch(/^x-app: &app\n(?:  .*\n)*  mem_limit: \d+[mg]$/m);
    expect(compose.match(/^    <<: \*app$/gm)).toHaveLength(2);
  });
});

describe("selfhost/Caddyfile", () => {
  const caddy = read("selfhost/Caddyfile");

  it("serves the API on an internal port for the apps (http, Docker network only)", () => {
    expect(caddy).toMatch(/^:8080 \{/m);
  });

  it("loads extra sites (search.atthebunga.com) only where they're mounted", () => {
    expect(caddy).toMatch(/^import \/etc\/caddy\/sites\/\*\.caddy$/m);
  });

  it("serves search.atthebunga.com only to Cloudflare (Origin CA cert plus Authenticated Origin Pulls)", () => {
    const site = read("selfhost/sites/search.caddy");
    expect(site).toMatch(/tls \/certs\/origin\.pem \/certs\/origin\.key/);
    expect(site).toMatch(/mode require_and_verify/);
    expect(site).toMatch(/reverse_proxy search:3000/);
  });
});

describe("selfhost/scripts/deploy.sh", () => {
  it("refuses anything but a known service (it's the deploy key's forced command)", () => {
    for (const arg of ["", "db", "kosh; rm -rf /", "../kosh"]) {
      let status = 0;
      try {
        execFileSync("sh", [join(root, "selfhost/scripts/deploy.sh")], {
          env: { ...process.env, SSH_ORIGINAL_COMMAND: arg, KOSH_DEPLOY_DRY_RUN: "1" },
          stdio: "pipe",
        });
      } catch (e) {
        status = (e as { status: number }).status;
      }
      expect(status, `arg ${JSON.stringify(arg)}`).toBe(2);
    }
  });

  it("accepts kosh, search and selfhost (config only)", () => {
    for (const arg of ["kosh", "search", "selfhost"]) {
      const out = execFileSync("sh", [join(root, "selfhost/scripts/deploy.sh")], {
        env: { ...process.env, SSH_ORIGINAL_COMMAND: arg, KOSH_DEPLOY_DRY_RUN: "1" },
        encoding: "utf8",
      });
      expect(out).toContain(`deploy ${arg}`);
    }
  });
});
