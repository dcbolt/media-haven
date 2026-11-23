import { supabaseAdmin } from "./supabase";
import { getDeviceReloadAt } from "./fleet-reload";
import { isMissingColumnError } from "./tv-state-db";
import { tvStateRequireSecretEnabled } from "./tv-state-secret.ts";
import {
  promotePendingTvStateSecret,
  queueTvStateSecretPickup,
  redeemTvStatePickup,
  revokeTvStateSecret,
} from "./tv-state-pickup.ts";
import { shouldWriteLastLegacyAuthAt } from "./tv-state-legacy-auth.ts";
import {
  buildUnauthorizedPollBodyWithDeps,
  resolveTvStateWithDeps,
  type TvDeviceAuthRow,
  type TvStateResolveDeps,
  unauthorizedBodyIsBrandingOnly,
} from "./tv-state-resolve.ts";
import { getTvState, registerTvDevice, type TvState } from "./tv.ts";

const AUTH_COLS_FULL =
  "state_secret_hash, state_secret_pending_hash, state_secret_required_at, state_secret_pickup_hash, state_secret_pickup_expires_at, last_legacy_auth_at, property_id, pair_code, label";

const AUTH_COLS_LEGACY = "property_id, pair_code, label";

async function loadTvDeviceAuthRow(
  deviceId: string
): Promise<TvDeviceAuthRow | null> {
  const db = supabaseAdmin();
  if (!db) return null;
  const full = await db
    .from("tv_devices")
    .select(AUTH_COLS_FULL)
    .eq("id", deviceId)
    .maybeSingle();
  if (!full.error && full.data) {
    return full.data as TvDeviceAuthRow;
  }
  if (full.error && !isMissingColumnError(full.error)) return null;
  const legacy = await db
    .from("tv_devices")
    .select(AUTH_COLS_LEGACY)
    .eq("id", deviceId)
    .maybeSingle();
  if (legacy.error || !legacy.data) return null;
  return {
    state_secret_hash: null,
    state_secret_pending_hash: null,
    state_secret_required_at: null,
    state_secret_pickup_hash: null,
    state_secret_pickup_expires_at: null,
    last_legacy_auth_at: null,
  };
}

function productionResolveDeps(): TvStateResolveDeps {
  return {
    requireSecretEnabled: tvStateRequireSecretEnabled,
    loadAuthRow: loadTvDeviceAuthRow,
    registerDevice: async (deviceId) => {
      await registerTvDevice(deviceId);
    },
    redeemPickup: redeemTvStatePickup,
    promotePending: promotePendingTvStateSecret,
    getFullState: getTvState,
    touchLastSeen: touchTvDeviceLastSeen,
    recordLegacyAuthAt: recordLastLegacyAuthAt,
    getForceReloadAt: getDeviceReloadAt,
    deploySha: () => process.env.VERCEL_GIT_COMMIT_SHA ?? null,
  };
}

export async function touchTvDeviceLastSeen(deviceId: string): Promise<void> {
  const db = supabaseAdmin();
  if (!db) return;
  await db
    .from("tv_devices")
    .update({ last_seen: new Date().toISOString() })
    .eq("id", deviceId);
}

export async function recordLastLegacyAuthAt(deviceId: string): Promise<void> {
  const db = supabaseAdmin();
  if (!db) return;
  const { data } = await db
    .from("tv_devices")
    .select("last_legacy_auth_at")
    .eq("id", deviceId)
    .maybeSingle();
  const prev = (data as { last_legacy_auth_at?: string | null } | null)
    ?.last_legacy_auth_at;
  if (!shouldWriteLastLegacyAuthAt(prev)) return;
  const at = new Date().toISOString();
  const { error } = await db
    .from("tv_devices")
    .update({ last_legacy_auth_at: at })
    .eq("id", deviceId);
  if (error && !isMissingColumnError(error)) return;
}

/** F-5595: 401 still bumps last_seen and returns host reload stamp (no guest payload). */
export async function buildUnauthorizedPollBody(
  deviceId: string
): Promise<TvState & { error: string; deploy?: string | null }> {
  return buildUnauthorizedPollBodyWithDeps(productionResolveDeps(), deviceId);
}

export { unauthorizedBodyIsBrandingOnly };

/** Host rotation / backfill: mint pickup for TV to redeem on poll (host channel only). */
export async function issueTvStateSecret(
  deviceId: string,
  hostIdentity?: string | null
): Promise<{ token: string; expiresAt: string } | null> {
  return queueTvStateSecretPickup(deviceId, hostIdentity);
}

export { queueTvStateSecretPickup, revokeTvStateSecret };

export async function resolveTvStateForDevice(
  deviceId: string,
  headerSecret: string | null,
  pickupToken: string | null
): Promise<
  | { status: 200; body: TvState & { deploy?: string | null; stateSecret?: string } }
  | { status: 401; body: TvState & { error: string } }
> {
  return resolveTvStateWithDeps(
    productionResolveDeps(),
    deviceId,
    headerSecret,
    pickupToken
  );
}

/** @internal Route smokes — injectable store. */
export { resolveTvStateWithDeps, type TvStateResolveDeps, type TvDeviceAuthRow };