import {
  attachStateSecretIfDelivering,
  evaluateTvStateAuth,
  responseHasGuestSecrets,
  verifyTvStateSecret,
  type TvStateAuthResult,
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

export type AuthRowLoadResult =
  | { kind: "ok"; row: TvDeviceAuthRow }
  | { kind: "missing" }
  | { kind: "error" };

export type TvStateResolveDeps = {
  requireSecretEnabled: () => boolean;
  loadAuthRow: (deviceId: string) => Promise<AuthRowLoadResult>;
  registerDevice: (deviceId: string) => Promise<void>;
  redeemPickup: (
    deviceId: string,
    pickupToken: string
  ) => Promise<{ redeemed: true; secret: string } | { redeemed: false }>;
  promotePending: (deviceId: string) => Promise<boolean>;
  getFullState: (deviceId: string) => Promise<TvState>;
  recordUnauthorizedAt: (deviceId: string) => Promise<void>;
  recordLegacyAuthAt: (deviceId: string) => Promise<void>;
  getForceReloadAt: (deviceId: string) => Promise<string | null>;
  deploySha: () => string | null;
  pickupAuthorizes?: typeof pickupAuthorizesPoll;
  /** Production auth gate (override only in mutant smokes). */
  evaluateAuth?: (opts: Parameters<typeof evaluateTvStateAuth>[0]) => TvStateAuthResult;
  /** Fail-closed body builder (override only in mutant smokes). */
  buildFailClosedBody?: (
    deps: TvStateResolveDeps,
    deviceId: string,
    error: "unauthorized" | "unavailable"
  ) => Promise<TvState & { error: string; deploy?: string | null }>;
};

export async function buildUnauthorizedPollBodyWithDeps(
  deps: TvStateResolveDeps,
  deviceId: string,
  error: "unauthorized" | "unavailable" = "unauthorized"
): Promise<TvState & { error: string; deploy?: string | null }> {
  if (deps.buildFailClosedBody) {
    return deps.buildFailClosedBody(deps, deviceId, error);
  }
  await deps.recordUnauthorizedAt(deviceId);
  const forceReloadAt = await deps.getForceReloadAt(deviceId);
  return {
    ...minimalUnauthorizedTvState(),
    forceReloadAt,
    pendingCommand: null,
    deploy: deps.deploySha(),
    error,
  };
}

function authEval(
  deps: TvStateResolveDeps,
  opts: Parameters<typeof evaluateTvStateAuth>[0]
): TvStateAuthResult {
  return (deps.evaluateAuth ?? evaluateTvStateAuth)(opts);
}

async function loadRowOrFail(
  deps: TvStateResolveDeps,
  deviceId: string
): Promise<
  | { ok: true; row: TvDeviceAuthRow }
  | { ok: false; status: 401 | 503; body: TvState & { error: string } }
> {
  let load: AuthRowLoadResult;
  try {
    load = await deps.loadAuthRow(deviceId);
  } catch {
    return {
      ok: false,
      status: 503,
      body: await buildUnauthorizedPollBodyWithDeps(deps, deviceId, "unavailable"),
    };
  }
  if (load.kind === "error") {
    return {
      ok: false,
      status: 503,
      body: await buildUnauthorizedPollBodyWithDeps(deps, deviceId, "unavailable"),
    };
  }
  if (load.kind === "missing") {
    await deps.registerDevice(deviceId);
    load = await deps.loadAuthRow(deviceId);
    if (load.kind !== "ok") {
      return {
        ok: false,
        status: 503,
        body: await buildUnauthorizedPollBodyWithDeps(deps, deviceId, "unavailable"),
      };
    }
  }
  return { ok: true, row: load.row };
}

export async function resolveTvStateWithDeps(
  deps: TvStateResolveDeps,
  deviceId: string,
  headerSecret: string | null,
  pickupToken: string | null
): Promise<
  | { status: 200; body: TvState & { deploy?: string | null; stateSecret?: string } }
  | { status: 401; body: TvState & { error: string } }
  | { status: 503; body: TvState & { error: string } }
> {
  const requireSecret = deps.requireSecretEnabled();
  const loaded = await loadRowOrFail(deps, deviceId);
  if (!loaded.ok) {
    return { status: loaded.status, body: loaded.body };
  }
  let row = loaded.row;

  if (
    row.state_secret_pending_hash &&
    verifyTvStateSecret(headerSecret, row.state_secret_pending_hash)
  ) {
    await deps.promotePending(deviceId);
    const again = await loadRowOrFail(deps, deviceId);
    if (!again.ok) {
      return { status: again.status, body: again.body };
    }
    row = again.row;
  }

  if (pickupToken) {
    const pickupValid = (deps.pickupAuthorizes ?? pickupAuthorizesPoll)(
      pickupToken,
      row.state_secret_pickup_hash,
      row.state_secret_pickup_expires_at
    );
    if (!pickupValid) {
      const body = await buildUnauthorizedPollBodyWithDeps(deps, deviceId);
      return { status: 401, body };
    }
    const redeem = await deps.redeemPickup(deviceId, pickupToken);
    if (!redeem.redeemed) {
      const body = await buildUnauthorizedPollBodyWithDeps(deps, deviceId);
      return { status: 401, body };
    }
    const full = await deps.getFullState(deviceId);
    const body = attachStateSecretIfDelivering(
      { ...full, deploy: deps.deploySha() },
      true,
      redeem.secret
    );
    return { status: 200, body };
  }

  const auth = authEval(deps, {
    requireSecret,
    storedHash: row.state_secret_hash,
    pendingHash: row.state_secret_pending_hash,
    headerSecret,
    secretRequiredAt: row.state_secret_required_at,
  });

  if (!auth.authorized) {
    const body = await buildUnauthorizedPollBodyWithDeps(deps, deviceId);
    return { status: 401, body };
  }

  if (auth.legacy && shouldWriteLastLegacyAuthAt(row.last_legacy_auth_at)) {
    void deps.recordLegacyAuthAt(deviceId);
  }

  const full = await deps.getFullState(deviceId);
  return {
    status: 200,
    body: { ...full, deploy: deps.deploySha() },
  };
}

export { unauthorizedBodyIsBrandingOnly };