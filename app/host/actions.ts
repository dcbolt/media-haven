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
