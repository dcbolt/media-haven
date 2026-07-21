/**
 * Host TVs page ops. Called from POST /api/host/tvs — no server actions.
 */

import { requestDeviceReload } from "./fleet-reload";
import { savePairProfile } from "./pair-profile";
import {
  assignTvDevice,
  forgetTvDevice,
  renameTvDevice,
} from "./tv";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type TvOpResult = { ok: true } | { ok: false; error: string };

export async function assignTv(fd: FormData): Promise<TvOpResult> {
  const deviceId = String(fd.get("deviceId") ?? "");
  const propertyId = String(fd.get("propertyId") ?? "");
  if (!UUID_RE.test(deviceId)) return { ok: false, error: "bad device id" };
  const ok = await assignTvDevice(deviceId, propertyId || null);
  return ok ? { ok: true } : { ok: false, error: "link failed" };
}

export async function unlinkTv(fd: FormData): Promise<TvOpResult> {
  const deviceId = String(fd.get("deviceId") ?? "");
  if (!UUID_RE.test(deviceId)) return { ok: false, error: "bad device id" };
  const ok = await assignTvDevice(deviceId, null);
  return ok ? { ok: true } : { ok: false, error: "unlink failed" };
}

export async function renameTv(fd: FormData): Promise<TvOpResult> {
  const deviceId = String(fd.get("deviceId") ?? "");
  const label = String(fd.get("label") ?? "").trim();
  if (!UUID_RE.test(deviceId)) return { ok: false, error: "bad device id" };
  const ok = await renameTvDevice(deviceId, label);
  return ok ? { ok: true } : { ok: false, error: "rename failed" };
}

export async function forgetTv(fd: FormData): Promise<TvOpResult> {
  const deviceId = String(fd.get("deviceId") ?? "");
  if (!UUID_RE.test(deviceId)) return { ok: false, error: "bad device id" };
  const ok = await forgetTvDevice(deviceId);
  return ok ? { ok: true } : { ok: false, error: "forget failed" };
}

/** S0.3b: stamp org settings so the TV kiosk reloads on next poll. */
export async function reloadTv(fd: FormData): Promise<TvOpResult> {
  const deviceId = String(fd.get("deviceId") ?? "");
  if (!UUID_RE.test(deviceId)) return { ok: false, error: "bad device id" };
  const result = await requestDeviceReload(deviceId);
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

/** S5.1: save org pair profile (defaults on claim). */
export async function savePairProfileOp(fd: FormData): Promise<TvOpResult> {
  const deviceClass =
    String(fd.get("deviceClass") ?? "streamer") === "signage"
      ? "signage"
      : "streamer";
  const labelPrefix = String(fd.get("labelPrefix") ?? "Living");
  const autoLabel = String(fd.get("autoLabel") ?? "") === "on";
  const seedPlaylistIfEmpty =
    String(fd.get("seedPlaylistIfEmpty") ?? "") === "on";
  const result = await savePairProfile({
    deviceClass,
    labelPrefix,
    autoLabel,
    seedPlaylistIfEmpty,
  });
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}
