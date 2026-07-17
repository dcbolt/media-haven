"use server";

import { redirect } from "next/navigation";
import { isHostAuthenticated } from "@/lib/host-auth";
import { mintGuestToken } from "@/lib/tokens";
import { claimTvDevice } from "@/lib/tv";

export async function mintTokenAction(formData: FormData) {
  if (!(await isHostAuthenticated())) redirect("/host/login");

  const reservationId = String(formData.get("reservationId") ?? "");
  const checkOut = String(formData.get("checkOut") ?? "");
  if (!reservationId || !checkOut) redirect("/host?error=missing");

  const minted = await mintGuestToken(reservationId, checkOut);
  redirect(`/host?minted=${encodeURIComponent(minted.token)}`);
}

export async function syncGuestyAction() {
  if (!(await isHostAuthenticated())) redirect("/host/login");
  const { syncGuestyProperties } = await import("@/lib/sync");
  const result = await syncGuestyProperties();
  redirect(
    result.ok ? `/host?sync=${result.count}` : `/host?syncerr=${result.reason}`
  );
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Signage-name correction for a stay. Blank clears the override so the
 *  Guesty-derived family label comes back. */
export async function renameGuestAction(formData: FormData) {
  if (!(await isHostAuthenticated())) redirect("/host/login");
  const { supabaseAdmin } = await import("@/lib/supabase");
  const reservationId = String(formData.get("reservationId") ?? "");
  if (!UUID_RE.test(reservationId)) redirect("/host?error=bad-reservation");
  const db = supabaseAdmin();
  if (!db) redirect("/host?error=no-db");
  const label =
    String(formData.get("label") ?? "")
      .trim()
      .slice(0, 80) || null;
  const { error } = await db
    .from("reservations")
    .update({ guest_label_override: label })
    .eq("id", reservationId);
  redirect(error ? "/host?error=rename-failed" : "/host?renamed=1");
}

export async function pairTvAction(formData: FormData) {
  if (!(await isHostAuthenticated())) redirect("/host/login");

  const pairCode = String(formData.get("pairCode") ?? "").trim();
  const propertyId = String(formData.get("propertyId") ?? "");
  if (!/^[A-Za-z0-9]{6}$/.test(pairCode) || !propertyId) {
    redirect("/host?tv=invalid");
  }

  const ok = await claimTvDevice(pairCode, propertyId);
  redirect(`/host?tv=${ok ? "paired" : "failed"}`);
}
