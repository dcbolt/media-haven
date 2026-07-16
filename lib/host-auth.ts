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
  // trim: env values pasted into dashboards routinely pick up a trailing
  // newline/space, which would make every login attempt fail.
  return (process.env.HOST_ACCESS_CODE || "demo").trim();
}

export function isCustomAccessCode(): boolean {
  return Boolean(process.env.HOST_ACCESS_CODE?.trim());
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
  const given = Buffer.from(code.trim());
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export async function isHostAuthenticated(): Promise<boolean> {
  const store = await cookies();
  const value = store.get(COOKIE_NAME)?.value;
  return value === sessionCookieValue();
}

export const HOST_COOKIE_NAME = COOKIE_NAME;
