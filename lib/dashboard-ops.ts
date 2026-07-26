/**
 * Host dashboard ops (mint / pair / rename guest / Guesty sync).
 * Called from POST /api/host/dashboard — no server actions.
 */

import { mintGuestToken } from "./tokens";
import { claimTvDevice } from "./tv";
import { supabaseAdmin } from "./supabase";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type DashboardResult =
  | { ok: true; redirect?: string }
  | { ok: false; error: string };

export async function mintToken(fd: FormData): Promise<DashboardResult> {
  const reservationId = String(fd.get("reservationId") ?? "");
  const checkOut = String(fd.get("checkOut") ?? "");
  if (!reservationId || !checkOut) {
    return { ok: false, error: "missing reservation" };
  }
  try {
    const minted = await mintGuestToken(reservationId, checkOut);
    return {
      ok: true,
      redirect: `/host?minted=${encodeURIComponent(minted.token)}`,
    };
  } catch {
    return { ok: false, error: "mint failed" };
  }
}

export async function syncGuesty(fd: FormData): Promise<DashboardResult> {
  void fd; // ApiForm always posts FormData; sync itself needs no fields
  const { syncGuestyProperties } = await import("./sync");
  const result = await syncGuestyProperties();
  if (!result.ok) {
    return { ok: false, error: result.reason };
  }
  return {
    ok: true,
    redirect: `/host?sync=${result.count}`,
  };
}

export async function renameGuest(fd: FormData): Promise<DashboardResult> {
  const reservationId = String(fd.get("reservationId") ?? "");
  if (!UUID_RE.test(reservationId)) {
    return { ok: false, error: "bad reservation id" };
  }
  const db = supabaseAdmin();
  if (!db) return { ok: false, error: "no database" };
  const label =
    String(fd.get("label") ?? "")
      .trim()
      .slice(0, 80) || null;
  const { error } = await db
    .from("reservations")
    .update({ guest_label_override: label })
    .eq("id", reservationId);
  if (error) return { ok: false, error: "rename failed" };
  return { ok: true };
}

export async function pairTv(fd: FormData): Promise<DashboardResult> {
  const pairCode = String(fd.get("pairCode") ?? "").trim();
  const propertyId = String(fd.get("propertyId") ?? "");
  if (!/^[A-Za-z0-9]{6}$/.test(pairCode) || !propertyId) {
    return { ok: false, error: "invalid code or property" };
  }
  const ok = await claimTvDevice(pairCode, propertyId);
  if (!ok) return { ok: false, error: "code did not match an unpaired TV" };
  return { ok: true };
}
