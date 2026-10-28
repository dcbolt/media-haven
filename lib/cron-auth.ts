import { timingSafeEqual } from "crypto";

/** Vercel Cron / scheduled jobs — fails closed when CRON_SECRET is unset. */
export function verifyCronBearer(authorizationHeader: string | null): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const expected = `Bearer ${secret}`;
  const given = authorizationHeader ?? "";
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
