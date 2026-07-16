import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

/**
 * Minimal host gate until Supabase Auth is wired up (needs a live Supabase
 * project). One shared access code (HOST_ACCESS_CODE) exchanged for a signed
 * cookie. Deliberately not multi-user — replace with Supabase Auth in Phase 2.
 *
 * In mock mode (no HOST_ACCESS_CODE set) the code is "demo", matching the
 * rest of the zero-config demo experience.
 */

const COOKIE_NAME = "fh_host";

function accessCode(): string {
  return process.env.HOST_ACCESS_CODE || "demo";
}

function sign(value: string): string {
  return createHmac("sha256", `fh-host-${accessCode()}`)
    .update(value)
    .digest("hex");
}

export function sessionCookieValue(): string {
  return sign("host-session-v1");
}

export function verifyAccessCode(code: string): boolean {
  const expected = Buffer.from(accessCode());
  const given = Buffer.from(code);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export async function isHostAuthenticated(): Promise<boolean> {
  const store = await cookies();
  const value = store.get(COOKIE_NAME)?.value;
  return value === sessionCookieValue();
}

export const HOST_COOKIE_NAME = COOKIE_NAME;
