import { createHash, randomBytes } from "crypto";

export const QR_VISITOR_COOKIE = "mh_qr_vid";
/** Dedupe cookie only — not used for tracking identity off-device. */
export const QR_VISITOR_COOKIE_MAX_AGE_SEC = 60 * 60 * 24;

const COOKIE_TOKEN_RE = /^[a-zA-Z0-9_-]{8,16}$/;

/** Fresh cookie value (<= 16 chars) issued to the guest browser. */
export function mintQrVisitorCookieToken(): string {
  return randomBytes(9).toString("base64url").slice(0, 16);
}

export function isValidQrVisitorCookieToken(raw: string | null | undefined): boolean {
  if (!raw) return false;
  return COOKIE_TOKEN_RE.test(raw) && raw.length <= 16;
}

/** Stored visitor_key — SHA-256(salt || token). Null when salt unset (fail-safe: no dedupe store). */
export function hashQrVisitorKey(
  cookieToken: string | null | undefined
): string | null {
  const salt = process.env.QR_VISITOR_HASH_SALT?.trim();
  if (!salt || !isValidQrVisitorCookieToken(cookieToken)) return null;
  return createHash("sha256")
    .update(salt)
    .update("\0")
    .update(cookieToken!)
    .digest("hex");
}