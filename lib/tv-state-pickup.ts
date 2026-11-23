import { supabaseAdmin } from "./supabase";
import { hashTvStateSecret, mintTvStateSecret } from "./tv-state-secret.ts";
import {
  hashTvStatePickupToken,
  mintTvStatePickupToken,
  TV_STATE_PICKUP_TTL_MS,
  verifyTvStatePickupToken,
} from "./tv-state-pickup-policy.ts";

export {
  TV_PICKUP_QUERY_PARAM,
  TV_STATE_PICKUP_HEADER,
  TV_STATE_PICKUP_TTL_MS,
  hashTvStatePickupToken,
  mintTvStatePickupToken,
  pollMayReturnStateSecret,
  responseHasStateSecret,
  verifyTvStatePickupToken,
} from "./tv-state-pickup-policy.ts";

export type QueuedPickup = {
  token: string;
  expiresAt: string;
};

export function pickupAuthorizesPoll(
  pickupToken: string | null | undefined,
  pickupHash: string | null | undefined,
  expiresAt: string | null | undefined
): boolean {
  return verifyTvStatePickupToken(pickupToken, pickupHash, expiresAt);
}

function logPickupMint(deviceId: string, hostIdentity: string | null): void {
  const prefix = deviceId.slice(0, 8);
  const host = hostIdentity?.trim() || "unknown-host";
  console.info(
    JSON.stringify({
      event: "tv_state_pickup_mint",
      devicePrefix: prefix,
      host,
    })
  );
}

/**
 * Host-authenticated only: stage pickup; **supersedes** prior bearer hash (MH186-8).
 */
export async function queueTvStateSecretPickup(
  deviceId: string,
  hostIdentity?: string | null
): Promise<QueuedPickup | null> {
  const db = supabaseAdmin();
  if (!db) return null;
  const token = mintTvStatePickupToken();
  const hash = hashTvStatePickupToken(token);
  const expiresAt = new Date(Date.now() + TV_STATE_PICKUP_TTL_MS).toISOString();
  const { error } = await db
    .from("tv_devices")
    .update({
      state_secret_pickup_hash: hash,
      state_secret_pickup_expires_at: expiresAt,
      state_secret_hash: null,
    })
    .eq("id", deviceId);
  if (error) return null;
  logPickupMint(deviceId, hostIdentity ?? null);
  return { token, expiresAt };
}

export async function revokeTvStateSecret(deviceId: string): Promise<boolean> {
  const db = supabaseAdmin();
  if (!db) return false;
  const { error } = await db
    .from("tv_devices")
    .update({
      state_secret_hash: null,
      state_secret_pickup_hash: null,
      state_secret_pickup_expires_at: null,
    })
    .eq("id", deviceId);
  return !error;
}

export type PickupRedeemResult =
  | { redeemed: true; secret: string }
  | { redeemed: false };

/**
 * Single-use pickup → mint state secret (MH186-3: conditional UPDATE is the claim).
 */
export async function redeemTvStatePickup(
  deviceId: string,
  pickupToken: string | null | undefined
): Promise<PickupRedeemResult> {
  if (!pickupToken) return { redeemed: false };
  const db = supabaseAdmin();
  if (!db) return { redeemed: false };

  const pickupHash = hashTvStatePickupToken(pickupToken);
  const nowIso = new Date().toISOString();
  const { secret, hash: secretHash } = mintTvStateSecret();

  const { data, error } = await db
    .from("tv_devices")
    .update({
      state_secret_hash: secretHash,
      state_secret_pickup_hash: null,
      state_secret_pickup_expires_at: null,
    })
    .eq("id", deviceId)
    .eq("state_secret_pickup_hash", pickupHash)
    .gt("state_secret_pickup_expires_at", nowIso)
    .select("id");

  if (error || !data?.length) return { redeemed: false };
  return { redeemed: true, secret };
}