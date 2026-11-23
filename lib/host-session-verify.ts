import { createHmac, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "./supabase.ts";

let cached: { value: string; at: number } | null = null;

/** Test-only: pin resolved code (simulates app_config without a live DB). */
let testAccessCodeOverride: string | null | undefined;

export function overrideHostAccessCodeForTests(code: string | null): void {
  testAccessCodeOverride = code;
  cached = null;
}

export function resetHostSessionAccessCodeCacheForTests(): void {
  cached = null;
  testAccessCodeOverride = undefined;
}

async function accessCode(): Promise<string> {
  if (testAccessCodeOverride !== undefined) {
    return testAccessCodeOverride ?? (process.env.HOST_ACCESS_CODE || "demo").trim();
  }
  if (cached && Date.now() - cached.at < 60_000) return cached.value;
  let code = "";
  const db = supabaseAdmin();
  if (db) {
    try {
      const { data } = await db
        .from("app_config")
        .select("value")
        .eq("key", "host_access_code")
        .maybeSingle();
      code = data?.value?.trim() ?? "";
    } catch {
      // table not migrated yet — fall through to env/demo
    }
  }
  if (!code) code = (process.env.HOST_ACCESS_CODE || "demo").trim();
  cached = { value: code, at: Date.now() };
  return code;
}

async function sign(value: string): Promise<string> {
  return createHmac("sha256", `fh-host-${await accessCode()}`)
    .update(value)
    .digest("hex");
}

function b64url(s: string): string {
  return Buffer.from(s, "utf8").toString("base64url");
}
function fromB64url(s: string): string {
  try {
    return Buffer.from(s, "base64url").toString("utf8");
  } catch {
    return "";
  }
}

/** Verify a raw `fh_host` cookie value (HMAC). Forged names/values fail closed. */
export async function verifyHostSessionCookie(
  value: string | undefined
): Promise<boolean> {
  if (!value) return false;
  const dot = value.indexOf(".");
  if (dot <= 0) return false;
  const id = fromB64url(value.slice(0, dot));
  if (!id) return false;
  const expected = Buffer.from(await sign(`host-session-v1:${id}`));
  const given = Buffer.from(value.slice(dot + 1));
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export async function issueHostCookieForTests(identity: string): Promise<string> {
  const id = identity.trim().slice(0, 120) || "host";
  return `${b64url(id)}.${await sign(`host-session-v1:${id}`)}`;
}