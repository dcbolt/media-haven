/**
 * Host TVs page ops. Called from POST /api/host/tvs — no server actions.
 */

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
