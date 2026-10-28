import { NextRequest, NextResponse } from "next/server";
import { verifyCronBearer } from "@/lib/cron-auth";
import { runTvOfflineAlerts } from "@/lib/tv-offline-alerts";

export const maxDuration = 60;

/**
 * S0.2 fleet offline/stale alert cron.
 * Auth: Bearer CRON_SECRET only (lib/cron-auth — fails closed if unset).
 */
export async function GET(req: NextRequest) {
  if (!verifyCronBearer(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const dry = req.nextUrl.searchParams.get("dry") === "1";
  const summary = await runTvOfflineAlerts(dry);
  return NextResponse.json(summary);
}
