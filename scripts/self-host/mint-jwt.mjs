#!/usr/bin/env node
// Mints the two API keys supabase-js sends, as Supabase does: HS256 JWTs whose `role` claim
// PostgREST switches to (anon or service_role), valid for ten years. No dependencies.
//
//   JWT_SECRET=$(openssl rand -base64 48) node scripts/self-host/mint-jwt.mjs
//
// prints ANON_KEY=... and SERVICE_ROLE_KEY=... for .env files. The same secret goes in
// postgrest.conf (jwt-secret). Rotating the secret invalidates both keys at once.
import { createHmac } from "node:crypto";

const secret = process.env.JWT_SECRET;
if (!secret || secret.length < 32) {
  console.error("JWT_SECRET must be set, at least 32 characters (PostgREST rejects shorter ones)");
  process.exit(1);
}

const b64url = (s) => Buffer.from(s).toString("base64url");

function sign(role) {
  const iat = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({ iss: "self-hosted", role, iat, exp: iat + 10 * 365 * 24 * 3600 }));
  const sig = createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${sig}`;
}

console.log(`ANON_KEY=${sign("anon")}`);
console.log(`SERVICE_ROLE_KEY=${sign("service_role")}`);
