#!/usr/bin/env node
/**
 * Mint HS256 JWTs for the throwaway PostgREST stack (matches PGRST_JWT_SECRET).
 * Usage: node tests/signage-e2e/mint-jwt.mjs <anon|service_role>
 */
import { createHmac } from "node:crypto";

const role = process.argv[2] ?? "anon";
const secret =
  process.env.PGRST_JWT_SECRET ??
  "super-secret-jwt-token-with-at-least-32-characters-long";

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}

const header = b64url({ alg: "HS256", typ: "JWT" });
const now = Math.floor(Date.now() / 1000);
const payload = b64url({
  role,
  iss: "supabase-demo",
  iat: now,
  exp: now + 3600,
});
const sig = createHmac("sha256", secret)
  .update(`${header}.${payload}`)
  .digest("base64url");
process.stdout.write(`${header}.${payload}.${sig}`);