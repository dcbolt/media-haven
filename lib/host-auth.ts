import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { supabaseAdmin } from "./supabase";

/**
 * Minimal host gate until Supabase Auth is wired up (needs a live Supabase
 * project). One shared access code exchanged for a signed cookie.
 * Deliberately not multi-user — replace with Supabase Auth in Phase 2.
 *
 * The code lives in app_config (key 'host_access_code', migration 0015) so
 * it can be rotated without touching Vercel env; HOST_ACCESS_CODE env is
 * the fallback and "demo" the zero-config default. Rotating the code signs
 * every host out (the session cookie is keyed on it) — intended.
 */

const COOKIE_NAME = "fh_host";

// Per-instance memo: the login gate must not add a DB round-trip to every
// host page load. 60s staleness after a rotation is acceptable.
let cached: { value: string; at: number } | null = null;

async function accessCode(): Promise<string> {
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
  // trim: env values pasted into dashboards routinely pick up a trailing
  // newline/space, which would make every login attempt fail.
  if (!code) code = (process.env.HOST_ACCESS_CODE || "demo").trim();
  cached = { value: code, at: Date.now() };
  return code;
}

export async function isCustomAccessCode(): Promise<boolean> {
  return (await accessCode()) !== "demo";
}

async function sign(value: string): Promise<string> {
  return createHmac("sha256", `fh-host-${await accessCode()}`)
    .update(value)
    .digest("hex");
}

export async function sessionCookieValue(): Promise<string> {
  return sign("host-session-v1");
}

export async function verifyAccessCode(code: string): Promise<boolean> {
  const expected = Buffer.from(await accessCode());
  const given = Buffer.from(code.trim());
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export async function isHostAuthenticated(): Promise<boolean> {
  const store = await cookies();
  const value = store.get(COOKIE_NAME)?.value;
  return Boolean(value) && value === (await sessionCookieValue());
}

export const HOST_COOKIE_NAME = COOKIE_NAME;

/** Google sign-in allowlist: app_config 'host_allowed_emails' (comma-sep,
 *  case-insensitive) → HOST_ALLOWED_EMAILS env → deny. A Google account
 *  that isn't listed gets a 403 even with a valid Google session. */
export async function isAllowedHostEmail(email: string): Promise<boolean> {
  const norm = email.trim().toLowerCase();
  if (!norm) return false;
  let raw = "";
  const db = supabaseAdmin();
  if (db) {
    try {
      const { data } = await db
        .from("app_config")
        .select("value")
        .eq("key", "host_allowed_emails")
        .maybeSingle();
      raw = data?.value ?? "";
    } catch {
      // table missing — fall through to env
    }
  }
  if (!raw) raw = process.env.HOST_ALLOWED_EMAILS ?? "";
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(norm);
}

/** Issue the signed host-session cookie value (shared by code + Google
 *  sign-in paths). */
export async function issueHostCookie(): Promise<{
  name: string;
  value: string;
  options: {
    httpOnly: boolean;
    sameSite: "lax";
    secure: boolean;
    maxAge: number;
    path: string;
  };
}> {
  return {
    name: COOKIE_NAME,
    value: await sessionCookieValue(),
    options: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 12,
      path: "/",
    },
  };
}
