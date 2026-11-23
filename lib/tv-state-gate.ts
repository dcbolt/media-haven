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
  type AuthRowLoadResult,
  type TvDeviceAuthRow,
  type TvStateResolveDeps,
  unauthorizedBodyIsBrandingOnly,
} from "./tv-state-resolve.ts";
import { getTvState, registerTvDevice, type TvState } from "./tv.ts";

const AUTH_COLS_FULL =
  "state_secret_hash, state_secret_pending_hash, state_secret_required_at, state_secret_pickup_hash, state_secret_pickup_expires_at, last_legacy_auth_at, property_id, pair_code, label";

const AUTH_COLS_LEGACY = "property_id, pair_code, label";

const EMPTY_AUTH_ROW: TvDeviceAuthRow = {
  state_secret_hash: null,
  state_secret_pending_hash: null,
  state_secret_required_at: null,
  state_secret_pickup_hash: null,
  state_secret_pickup_expires_at: null,
  last_legacy_auth_at: null,
};

async function loadTvDeviceAuthRowResult(
  deviceId: string
): Promise<AuthRowLoadResult> {
  const db = supabaseAdmin();
  /** CI/mock smoke has no Supabase — keep never-blank demo polls on unenrolled row. */
  if (!db) return { kind: "ok", row: { ...EMPTY_AUTH_ROW } };
  const full = await db
    .from("tv_devices")
    .select(AUTH_COLS_FULL)
    .eq("id", deviceId)
    .maybeSingle();
  if (!full.error) {
    if (!full.data) return { kind: "missing" };
    return { kind: "ok", row: full.data as TvDeviceAuthRow };
  }
  if (!isMissingColumnError(full.error)) {
    return { kind: "error" };
  }
  const legacy = await db
    .from("tv_devices")
    .select(AUTH_COLS_LEGACY)
    .eq("id", deviceId)
    .maybeSingle();
  if (legacy.error) return { kind: "error" };
  if (!legacy.data) return { kind: "missing" };
  return { kind: "ok", row: { ...EMPTY_AUTH_ROW } };
}

export function createProductionTvStateResolveDeps(): TvStateResolveDeps {
  return {
    requireSecretEnabled: tvStateRequireSecretEnabled,
    loadAuthRow: loadTvDeviceAuthRowResult,
    registerDevice: async (deviceId) => {
      await registerTvDevice(deviceId);
    },
    redeemPickup: redeemTvStatePickup,
    promotePending: promotePendingTvStateSecret,
    getFullState: getTvState,
    recordUnauthorizedAt: recordTvUnauthorizedAt,
    recordLegacyAuthAt: recordLastLegacyAuthAt,
    getForceReloadAt: getDeviceReloadAt,
    deploySha: () => process.env.VERCEL_GIT_COMMIT_SHA ?? null,
  };
}

export async function recordTvUnauthorizedAt(deviceId: string): Promise<void> {
  const db = supabaseAdmin();
  if (!db) return;
  const at = new Date().toISOString();
  const { error } = await db
    .from("tv_devices")
    .update({ last_unauthorized_at: at })
    .eq("id", deviceId);
  if (error && !isMissingColumnError(error)) return;
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

/** Fail-closed poll body (401/503): no last_seen bump; records last_unauthorized_at. */
export async function buildUnauthorizedPollBody(
  deviceId: string
): Promise<TvState & { error: string; deploy?: string | null }> {
  return buildUnauthorizedPollBodyWithDeps(
    createProductionTvStateResolveDeps(),
    deviceId
  );
}

export { unauthorizedBodyIsBrandingOnly };

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
  | { status: 503; body: TvState & { error: string } }
> {
  return resolveTvStateWithDeps(
    createProductionTvStateResolveDeps(),
    deviceId,
    headerSecret,
    pickupToken
  );
}

export {
  resolveTvStateWithDeps,
  loadTvDeviceAuthRowResult,
  type TvStateResolveDeps,
  type TvDeviceAuthRow,
  type AuthRowLoadResult,
};