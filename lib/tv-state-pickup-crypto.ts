import { createHash, randomBytes, timingSafeEqual } from "crypto";

export const TV_STATE_PICKUP_HEADER = "x-tv-state-pickup";

/** Host→TV pairing channel: short-lived, single-use pickup for state secret. */
export const TV_STATE_PICKUP_TTL_MS = 15 * 60 * 1000;

export const TV_PICKUP_QUERY_PARAM = "pickup";

export function hashTvStatePickupToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function mintTvStatePickupToken(): string {
  return randomBytes(24).toString("base64url");
}

export function verifyTvStatePickupToken(
  provided: string | null | undefined,
  storedHash: string | null | undefined,
  expiresAtIso: string | null | undefined,
  nowMs: number = Date.now()
): boolean {
  if (!provided || !storedHash || !expiresAtIso) return false;
  if (new Date(expiresAtIso).getTime() <= nowMs) return false;
  const digest = hashTvStatePickupToken(provided);
  try {
    const a = Buffer.from(digest, "hex");
    const b = Buffer.from(storedHash, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** Policy helper for tests: UUID-only / legacy polls must never ship secrets. */
export function pollMayReturnStateSecret(opts: {
  pickupTokenPresent: boolean;
  pickupRedeemed: boolean;
}): boolean {
  return opts.pickupTokenPresent && opts.pickupRedeemed;
}

export function responseHasStateSecret(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  const key = (body as { stateSecret?: unknown }).stateSecret;
  return typeof key === "string" && key.length > 0;
}