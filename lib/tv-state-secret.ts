import { createHash, randomBytes, timingSafeEqual } from "crypto";
import type { TvContent, TvState } from "./tv";
import {
  TV_STATE_SECRET_HEADER,
  TV_STATE_SECRET_STORAGE_KEY,
} from "./tv-state-secret-keys.ts";

export { TV_STATE_SECRET_HEADER, TV_STATE_SECRET_STORAGE_KEY };

export function tvStateRequireSecretEnabled(): boolean {
  const v = (process.env.TV_STATE_REQUIRE_SECRET ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

let legacyUuidAuthCount = 0;

/** Grace-mode polls that authenticated with device UUID only (count only). */
export function tvStateLegacyAuthCount(): number {
  return legacyUuidAuthCount;
}

export function resetTvStateLegacyAuthCountForTests(): void {
  legacyUuidAuthCount = 0;
}

export function recordTvStateLegacyAuth(): void {
  legacyUuidAuthCount += 1;
}

export function mintTvStateSecret(): { secret: string; hash: string } {
  const secret = randomBytes(32).toString("base64url");
  return { secret, hash: hashTvStateSecret(secret) };
}

export function hashTvStateSecret(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

/** Constant-time compare of plaintext secret to stored SHA-256 hex. */
export function verifyTvStateSecret(
  provided: string | null | undefined,
  storedHash: string | null | undefined
): boolean {
  if (!provided || !storedHash) return false;
  const digest = hashTvStateSecret(provided);
  try {
    const a = Buffer.from(digest, "hex");
    const b = Buffer.from(storedHash, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export type TvStateAuthResult =
  | { authorized: true; legacy: boolean }
  | { authorized: false };

/** Decide whether this poll may return full TV state (guest fields). */
export function evaluateTvStateAuth(opts: {
  requireSecret: boolean;
  storedHash: string | null | undefined;
  headerSecret: string | null | undefined;
  /** Valid unexpired pickup → one authorized enrollment poll (MH186-1). */
  pickupAuthorizes: boolean;
}): TvStateAuthResult {
  if (opts.pickupAuthorizes) {
    return { authorized: true, legacy: false };
  }

  const enrolled = Boolean(opts.storedHash);
  const headerOk = enrolled
    ? verifyTvStateSecret(opts.headerSecret, opts.storedHash)
  : false;

  if (headerOk) return { authorized: true, legacy: false };

  // Per-device ratchet (MH186-2): once enrolled, UUID-only / wrong header → deny.
  if (enrolled) return { authorized: false };

  if (opts.requireSecret) return { authorized: false };

  // Grace: UUID-only only before first enrollment.
  recordTvStateLegacyAuth();
  return { authorized: true, legacy: true };
}

/** Remove guest / stay / portal credentials for fail-closed 401 bodies. */
export function stripTvContentGuestSecrets(content: TvContent): TvContent {
  return {
    ...content,
    occupied: false,
    guestFirstName: null,
    guestLabel: null,
    checkIn: null,
    checkOut: null,
    wifiPassword: null,
    wifiQr: null,
    portalQr: null,
    guestBook: null,
    nextYear: null,
    extendStay: null,
  };
}

export function responseHasGuestSecrets(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  const o = body as Record<string, unknown>;
  if ("guestFirstName" in o && o.guestFirstName) return true;
  if ("guestLabel" in o && o.guestLabel) return true;
  if ("wifiPassword" in o && o.wifiPassword) return true;
  if ("portalQr" in o && o.portalQr) return true;
  const content = o.content;
  if (content && typeof content === "object") {
    return responseHasGuestSecrets(content);
  }
  return false;
}

export type TvStateResponseExtras = {
  stateSecret?: string;
  deploy?: string | null;
  error?: string;
};

export function attachStateSecretIfDelivering<T extends TvState>(
  state: T,
  deliver: boolean,
  plaintext: string | null
): T & TvStateResponseExtras {
  if (!deliver || !plaintext) return state;
  return { ...state, stateSecret: plaintext };
}