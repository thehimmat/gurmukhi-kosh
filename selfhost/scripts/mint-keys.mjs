#!/usr/bin/env node
// Prints a fresh JWT secret and the anon, service and akhar keys signed with it, as selfhost/.env lines.
// The keys have the shape of Supabase's legacy keys (HS256, a `role` claim), so supabase-js and
// PostgREST treat them the same way. With JWT_SECRET already set, signs keys for that secret instead.
//
//   node selfhost/scripts/mint-keys.mjs >> selfhost/.env
import { createHmac, randomBytes } from "node:crypto";

const secret = process.env.JWT_SECRET || randomBytes(48).toString("base64url");
const TEN_YEARS = 10 * 365 * 24 * 3600;

function sign(role) {
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const body = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ iss: "gurmukhi-kosh", role, iat: now, exp: now + TEN_YEARS })}`;
  return `${body}.${createHmac("sha256", secret).update(body).digest("base64url")}`;
}

if (!process.env.JWT_SECRET) console.log(`JWT_SECRET=${secret}`);
console.log(`ANON_KEY=${sign("anon")}`);
console.log(`SERVICE_KEY=${sign("service_role")}`);
console.log(`AKHAR_KEY=${sign("akhar_writer")}`);
