"use server";

import { redirect } from "next/navigation";
import { isHostAuthenticated } from "@/lib/host-auth";
import { mintGuestToken } from "@/lib/tokens";

export async function mintTokenAction(formData: FormData) {
  if (!(await isHostAuthenticated())) redirect("/host/login");

  const reservationId = String(formData.get("reservationId") ?? "");
  const checkOut = String(formData.get("checkOut") ?? "");
  if (!reservationId || !checkOut) redirect("/host?error=missing");

  const minted = await mintGuestToken(reservationId, checkOut);
  redirect(`/host?minted=${encodeURIComponent(minted.token)}`);
}
