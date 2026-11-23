import { supabaseAdmin } from "./supabase";
import {
  attachStateSecretIfDelivering,
  evaluateTvStateAuth,
  stripTvContentGuestSecrets,
  tvStateRequireSecretEnabled,
} from "./tv-state-secret";
import {
  queueTvStateSecretPickup,
  redeemTvStatePickup,
} from "./tv-state-pickup";
import { getTvState, propertyTvState, registerTvDevice, type TvState } from "./tv";

export type TvDeviceAuthRow = {
  state_secret_hash: string | null;
  state_secret_pickup_hash: string | null;
  state_secret_pickup_expires_at: string | null;
  property_id: string | null;
  pair_code: string;
  label: string | null;
};

const AUTH_COLS =
  "state_secret_hash, state_secret_pickup_hash, state_secret_pickup_expires_at, property_id, pair_code, label";

export async function loadTvDeviceAuthRow(
  deviceId: string
): Promise<TvDeviceAuthRow | null> {
  const db = supabaseAdmin();
  if (!db) return null;
  const { data, error } = await db
    .from("tv_devices")
    .select(AUTH_COLS)
    .eq("id", deviceId)
    .maybeSingle();
  if (error || !data) return null;
  return data as TvDeviceAuthRow;
}

/** Host rotation / backfill: mint pickup for TV to redeem on poll (host channel only). */
export async function issueTvStateSecret(
  deviceId: string
): Promise<{ token: string; expiresAt: string } | null> {
  return queueTvStateSecretPickup(deviceId);
}

export { queueTvStateSecretPickup };

export async function failClosedTvState(deviceId: string): Promise<TvState> {
  const row = await loadTvDeviceAuthRow(deviceId);
  if (!row) {
    const reg = await registerTvDevice(deviceId);
    return reg;
  }
  if (!row.property_id) {
    return { mode: "pairing", pairCode: row.pair_code };
  }
  const { resolveJoinedOverride } = await import("./joined-stays");
  const joined = await resolveJoinedOverride(row.property_id);
  const base = joined
    ? (await propertyTvState(joined.group.joinedPropertyId, row.label ?? null, {
        wifiFromPropertyId: row.property_id,
      })) ??
      (await propertyTvState(row.property_id, row.label ?? null))
    : await propertyTvState(row.property_id, row.label ?? null);
  if (!base) {
    return { mode: "pairing", pairCode: row.pair_code };
  }
  return {
    mode: "active",
    content: stripTvContentGuestSecrets(base.content),
  };
}

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

  const auth = evaluateTvStateAuth({
    requireSecret,
    storedHash: row?.state_secret_hash,
    headerSecret,
  });

  if (!auth.authorized) {
    const safe = await failClosedTvState(deviceId);
    return {
      status: 401,
      body: { ...safe, error: "unauthorized" },
    };
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