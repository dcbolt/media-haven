import { supabaseAdmin } from "./supabase";
import { hostAuthMethodForLog } from "./host-auth-log.ts";
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

export { pickupAuthorizesPoll } from "./tv-state-pickup-policy.ts";

function logPickupMint(deviceId: string, hostIdentity: string | null): void {
  const prefix = deviceId.slice(0, 8);
  console.info(
    JSON.stringify({
      event: "tv_state_pickup_mint",
      devicePrefix: prefix,
      hostAuth: hostAuthMethodForLog(hostIdentity),
    })
  );
}

/**
 * Host-authenticated only: stage pickup; clears active+prior pending hash (MH186-8 / MH186-14).
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
      state_secret_pending_hash: null,
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
      state_secret_pending_hash: null,
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
 * Single-use pickup → stage pending hash; prior bearer stays valid until TV presents new secret (MH186-14).
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
  const { secret, hash: pendingHash } = mintTvStateSecret();

  const { data: existing } = await db
    .from("tv_devices")
    .select("state_secret_required_at")
    .eq("id", deviceId)
    .maybeSingle();

  const requiredAt =
    (existing as { state_secret_required_at?: string | null } | null)
      ?.state_secret_required_at ?? nowIso;

  const { data, error } = await db
    .from("tv_devices")
    .update({
      state_secret_pending_hash: pendingHash,
      state_secret_required_at: requiredAt,
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

/** Promote pending hash to active after TV presents the new bearer (MH186-14). */
export async function promotePendingTvStateSecret(
  deviceId: string
): Promise<boolean> {
  const db = supabaseAdmin();
  if (!db) return false;
  const { data: row } = await db
    .from("tv_devices")
    .select("state_secret_pending_hash")
    .eq("id", deviceId)
    .maybeSingle();
  const pending = (row as { state_secret_pending_hash?: string | null } | null)
    ?.state_secret_pending_hash;
  if (!pending) return false;
  const { error } = await db
    .from("tv_devices")
    .update({
      state_secret_hash: pending,
      state_secret_pending_hash: null,
    })
    .eq("id", deviceId)
    .eq("state_secret_pending_hash", pending);
  return !error;
}