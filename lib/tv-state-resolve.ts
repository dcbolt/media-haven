import {
  attachStateSecretIfDelivering,
  evaluateTvStateAuth,
  responseHasGuestSecrets,
  verifyTvStateSecret,
} from "./tv-state-secret.ts";
import { pickupAuthorizesPoll } from "./tv-state-pickup-policy.ts";
import { shouldWriteLastLegacyAuthAt } from "./tv-state-legacy-auth.ts";
import {
  minimalUnauthorizedTvState,
  unauthorizedBodyIsBrandingOnly,
} from "./tv-state-unauthorized.ts";
import type { TvState } from "./tv.ts";

export type TvDeviceAuthRow = {
  state_secret_hash: string | null;
  state_secret_pending_hash: string | null;
  state_secret_required_at: string | null;
  state_secret_pickup_hash: string | null;
  state_secret_pickup_expires_at: string | null;
  last_legacy_auth_at: string | null;
};

export type TvStateResolveDeps = {
  requireSecretEnabled: () => boolean;
  loadAuthRow: (deviceId: string) => Promise<TvDeviceAuthRow | null>;
  registerDevice: (deviceId: string) => Promise<void>;
  redeemPickup: (
    deviceId: string,
    pickupToken: string
  ) => Promise<{ redeemed: true; secret: string } | { redeemed: false }>;
  promotePending: (deviceId: string) => Promise<boolean>;
  getFullState: (deviceId: string) => Promise<TvState>;
  touchLastSeen: (deviceId: string) => Promise<void>;
  recordLegacyAuthAt: (deviceId: string) => Promise<void>;
  getForceReloadAt: (deviceId: string) => Promise<string | null>;
  deploySha: () => string | null;
};

export async function buildUnauthorizedPollBodyWithDeps(
  deps: TvStateResolveDeps,
  deviceId: string
): Promise<TvState & { error: string; deploy?: string | null }> {
  await deps.touchLastSeen(deviceId);
  const forceReloadAt = await deps.getForceReloadAt(deviceId);
  return {
    ...minimalUnauthorizedTvState(),
    forceReloadAt,
    pendingCommand: null,
    deploy: deps.deploySha(),
    error: "unauthorized" as const,
  };
}

export async function resolveTvStateWithDeps(
  deps: TvStateResolveDeps,
  deviceId: string,
  headerSecret: string | null,
  pickupToken: string | null
): Promise<
  | { status: 200; body: TvState & { deploy?: string | null; stateSecret?: string } }
  | { status: 401; body: TvState & { error: string } }
> {
  const requireSecret = deps.requireSecretEnabled();
  let row = await deps.loadAuthRow(deviceId);

  if (!row) {
    await deps.registerDevice(deviceId);
    row = await deps.loadAuthRow(deviceId);
  }

  if (
    row?.state_secret_pending_hash &&
    verifyTvStateSecret(headerSecret, row.state_secret_pending_hash)
  ) {
    await deps.promotePending(deviceId);
    row = await deps.loadAuthRow(deviceId);
  }

  if (pickupToken) {
    const pickupValid = pickupAuthorizesPoll(
      pickupToken,
      row?.state_secret_pickup_hash,
      row?.state_secret_pickup_expires_at
    );
    if (!pickupValid) {
      return {
        status: 401,
        body: await buildUnauthorizedPollBodyWithDeps(deps, deviceId),
      };
    }
    const redeem = await deps.redeemPickup(deviceId, pickupToken);
    if (!redeem.redeemed) {
      return {
        status: 401,
        body: await buildUnauthorizedPollBodyWithDeps(deps, deviceId),
      };
    }
    const full = await deps.getFullState(deviceId);
    const body = attachStateSecretIfDelivering(
      { ...full, deploy: deps.deploySha() },
      true,
      redeem.secret
    );
    return { status: 200, body };
  }

  const auth = evaluateTvStateAuth({
    requireSecret,
    storedHash: row?.state_secret_hash,
    pendingHash: row?.state_secret_pending_hash,
    headerSecret,
    secretRequiredAt: row?.state_secret_required_at,
  });

  if (!auth.authorized) {
    const body = await buildUnauthorizedPollBodyWithDeps(deps, deviceId);
    if (responseHasGuestSecrets(body)) {
      throw new Error("401 body leaked guest fields");
    }
    return { status: 401, body };
  }

  if (
    auth.legacy &&
    shouldWriteLastLegacyAuthAt(row?.last_legacy_auth_at)
  ) {
    void deps.recordLegacyAuthAt(deviceId);
  }

  const full = await deps.getFullState(deviceId);
  return {
    status: 200,
    body: { ...full, deploy: deps.deploySha() },
  };
}

export { unauthorizedBodyIsBrandingOnly };