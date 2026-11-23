import { supabaseAdmin } from "./supabase";
import { hashTvStateSecret, mintTvStateSecret } from "./tv-state-secret.ts";
import {
  hashTvStatePickupToken,
  mintTvStatePickupToken,
  TV_STATE_PICKUP_TTL_MS,
  verifyTvStatePickupToken,
} from "./tv-state-pickup-crypto.ts";

export {
  TV_PICKUP_QUERY_PARAM,
  TV_STATE_PICKUP_HEADER,
  TV_STATE_PICKUP_TTL_MS,
  hashTvStatePickupToken,
  mintTvStatePickupToken,
  pollMayReturnStateSecret,
  responseHasStateSecret,
  verifyTvStatePickupToken,
} from "./tv-state-pickup-crypto.ts";

export type QueuedPickup = {
  token: string;
  expiresAt: string;
};

/** Host-authenticated only: stage a one-time pickup bound to this device id. */
export async function queueTvStateSecretPickup(
  deviceId: string
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
    })
    .eq("id", deviceId);
  if (error) return null;
  return { token, expiresAt };
}

export async function clearTvStatePickup(deviceId: string): Promise<void> {
  const db = supabaseAdmin();
  if (!db) return;
  await db
    .from("tv_devices")
    .update({
      state_secret_pickup_hash: null,
      state_secret_pickup_expires_at: null,
    })
    .eq("id", deviceId);
}

export type PickupRedeemResult =
  | { redeemed: true; secret: string }
  | { redeemed: false };

/**
 * Single-use pickup → mint state secret, persist hash, clear pickup.
 * Returns secret plaintext once for poll body (never on UUID-only poll).
 */
export async function redeemTvStatePickup(
  deviceId: string,
  pickupToken: string | null | undefined
): Promise<PickupRedeemResult> {
  if (!pickupToken) return { redeemed: false };
  const db = supabaseAdmin();
  if (!db) return { redeemed: false };

  const { data, error } = await db
    .from("tv_devices")
    .select("state_secret_pickup_hash, state_secret_pickup_expires_at")
    .eq("id", deviceId)
    .maybeSingle();
  if (error || !data) return { redeemed: false };

  const hash = data.state_secret_pickup_hash as string | null;
  const expiresAt = data.state_secret_pickup_expires_at as string | null;
  if (!verifyTvStatePickupToken(pickupToken, hash, expiresAt)) {
    return { redeemed: false };
  }

  const { secret, hash: secretHash } = mintTvStateSecret();
  const { error: updErr } = await db
    .from("tv_devices")
    .update({
      state_secret_hash: secretHash,
      state_secret_pickup_hash: null,
      state_secret_pickup_expires_at: null,
    })
    .eq("id", deviceId);
  if (updErr) return { redeemed: false };

  return { redeemed: true, secret };
}