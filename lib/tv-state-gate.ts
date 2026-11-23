import { supabaseAdmin } from "./supabase";
import { getDeviceReloadAt } from "./fleet-reload";
import { isMissingColumnError } from "./tv-state-db";
import {
  attachStateSecretIfDelivering,
  evaluateTvStateAuth,
  tvStateRequireSecretEnabled,
} from "./tv-state-secret";
import {
  pickupAuthorizesPoll,
  queueTvStateSecretPickup,
  redeemTvStatePickup,
  revokeTvStateSecret,
} from "./tv-state-pickup";
import {
  minimalUnauthorizedTvState,
  unauthorizedBodyIsBrandingOnly,
} from "./tv-state-unauthorized";
import { getTvState, registerTvDevice, type TvState } from "./tv";

export type TvDeviceAuthRow = {
  state_secret_hash: string | null;
  state_secret_pickup_hash: string | null;
  state_secret_pickup_expires_at: string | null;
  property_id: string | null;
  pair_code: string;
  label: string | null;
};

const AUTH_COLS_FULL =
  "state_secret_hash, state_secret_pickup_hash, state_secret_pickup_expires_at, property_id, pair_code, label";

const AUTH_COLS_LEGACY = "property_id, pair_code, label";

export async function loadTvDeviceAuthRow(
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
    ...(legacy.data as Omit<
      TvDeviceAuthRow,
      "state_secret_hash" | "state_secret_pickup_hash" | "state_secret_pickup_expires_at"
    >),
    state_secret_hash: null,
    state_secret_pickup_hash: null,
    state_secret_pickup_expires_at: null,
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
  await touchTvDeviceLastSeen(deviceId);
  const forceReloadAt = await getDeviceReloadAt(deviceId);
  const body = {
    ...minimalUnauthorizedTvState(),
    forceReloadAt,
    pendingCommand: null,
    deploy: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    error: "unauthorized" as const,
  };
  return body;
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
  const requireSecret = tvStateRequireSecretEnabled();
  let row = await loadTvDeviceAuthRow(deviceId);

  if (!row) {
    await registerTvDevice(deviceId);
    row = await loadTvDeviceAuthRow(deviceId);
  }

  const pickupAuthorizes = pickupAuthorizesPoll(
    pickupToken,
    row?.state_secret_pickup_hash,
    row?.state_secret_pickup_expires_at
  );

  const auth = evaluateTvStateAuth({
    requireSecret,
    storedHash: row?.state_secret_hash,
    headerSecret,
    pickupAuthorizes,
  });

  if (!auth.authorized) {
    return {
      status: 401,
      body: await buildUnauthorizedPollBody(deviceId),
    };
  }

  if (auth.legacy) {
    void recordLastLegacyAuthAt(deviceId);
  }

  const full = await getTvState(deviceId);
  const deploy = process.env.VERCEL_GIT_COMMIT_SHA ?? null;

  let deliverSecret: string | null = null;
  if (pickupToken) {
    const redeem = await redeemTvStatePickup(deviceId, pickupToken);
    if (redeem.redeemed) deliverSecret = redeem.secret;
  }

  const body = attachStateSecretIfDelivering(
    { ...full, deploy },
    Boolean(deliverSecret),
    deliverSecret
  );

  return { status: 200, body };
}