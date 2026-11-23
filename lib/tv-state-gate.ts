import { supabaseAdmin } from "./supabase";
import {
  attachStateSecretIfDelivering,
  evaluateTvStateAuth,
  mintTvStateSecret,
  stripTvContentGuestSecrets,
  tvStateRequireSecretEnabled,
} from "./tv-state-secret";
import { getTvState, propertyTvState, registerTvDevice, type TvState } from "./tv";

export type TvDeviceAuthRow = {
  state_secret_hash: string | null;
  state_secret_deliver: boolean;
  property_id: string | null;
  pair_code: string;
  label: string | null;
};

const AUTH_COLS =
  "state_secret_hash, state_secret_deliver, property_id, pair_code, label";

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

export async function persistTvStateSecretHash(
  deviceId: string,
  hash: string,
  deliver: boolean
): Promise<boolean> {
  const db = supabaseAdmin();
  if (!db) return false;
  const { error } = await db
    .from("tv_devices")
    .update({
      state_secret_hash: hash,
      state_secret_deliver: deliver,
    })
    .eq("id", deviceId);
  return !error;
}

export async function markTvStateSecretDeliver(deviceId: string): Promise<boolean> {
  const db = supabaseAdmin();
  if (!db) return false;
  const { data } = await db
    .from("tv_devices")
    .select("id")
    .eq("id", deviceId)
    .maybeSingle();
  if (!data) return false;
  const { error } = await db
    .from("tv_devices")
    .update({ state_secret_deliver: true })
    .eq("id", deviceId);
  return !error;
}

/** Host rotation / backfill: TV receives a fresh secret on the next authorized poll. */
export async function issueTvStateSecret(deviceId: string): Promise<boolean> {
  return markTvStateSecretDeliver(deviceId);
}

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
  headerSecret: string | null
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
  if (row?.state_secret_deliver || !row?.state_secret_hash) {
    const { secret, hash } = mintTvStateSecret();
    if (await persistTvStateSecretHash(deviceId, hash, false)) {
      deliverSecret = secret;
    }
  }

  const body = attachStateSecretIfDelivering(
    { ...full, deploy },
    Boolean(deliverSecret),
    deliverSecret
  );

  return { status: 200, body };
}