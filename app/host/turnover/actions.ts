"use server";

import { redirect } from "next/navigation";
import { isHostAuthenticated } from "@/lib/host-auth";
import { recordTurnover, TURNOVER_ITEMS } from "@/lib/turnover";

export async function completeTurnoverAction(formData: FormData) {
  if (!(await isHostAuthenticated())) redirect("/host/login");

  const propertyId = String(formData.get("propertyId") ?? "");
  if (!propertyId) redirect("/host/turnover?err=no-property");

  const items: Record<string, boolean> = {};
  for (const item of TURNOVER_ITEMS) {
    items[item.slug] = formData.get(`item-${item.slug}`) === "on";
  }
  const notes = String(formData.get("notes") ?? "").trim() || null;

  const ok = await recordTurnover(propertyId, items, notes);
  redirect(ok ? "/host/turnover?ok=1" : "/host/turnover?err=save-failed");
}
