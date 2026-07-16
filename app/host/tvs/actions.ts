"use server";

import { redirect } from "next/navigation";
import { isHostAuthenticated } from "@/lib/host-auth";
import { assignTvDevice, forgetTvDevice, renameTvDevice } from "@/lib/tv";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function guard(): Promise<void> {
  if (!(await isHostAuthenticated())) redirect("/host/login");
}

export async function assignTvAction(formData: FormData) {
  await guard();
  const deviceId = String(formData.get("deviceId") ?? "");
  const propertyId = String(formData.get("propertyId") ?? "");
  if (!UUID_RE.test(deviceId)) redirect("/host/tvs?err=bad-device");
  const ok = await assignTvDevice(deviceId, propertyId || null);
  redirect(`/host/tvs?${ok ? "ok=linked" : "err=link-failed"}`);
}

export async function unlinkTvAction(formData: FormData) {
  await guard();
  const deviceId = String(formData.get("deviceId") ?? "");
  if (!UUID_RE.test(deviceId)) redirect("/host/tvs?err=bad-device");
  const ok = await assignTvDevice(deviceId, null);
  redirect(`/host/tvs?${ok ? "ok=unlinked" : "err=unlink-failed"}`);
}

export async function renameTvAction(formData: FormData) {
  await guard();
  const deviceId = String(formData.get("deviceId") ?? "");
  const label = String(formData.get("label") ?? "").trim();
  if (!UUID_RE.test(deviceId)) redirect("/host/tvs?err=bad-device");
  const ok = await renameTvDevice(deviceId, label);
  redirect(`/host/tvs?${ok ? "ok=renamed" : "err=rename-failed"}`);
}

export async function forgetTvAction(formData: FormData) {
  await guard();
  const deviceId = String(formData.get("deviceId") ?? "");
  if (!UUID_RE.test(deviceId)) redirect("/host/tvs?err=bad-device");
  const ok = await forgetTvDevice(deviceId);
  redirect(`/host/tvs?${ok ? "ok=forgotten" : "err=forget-failed"}`);
}
