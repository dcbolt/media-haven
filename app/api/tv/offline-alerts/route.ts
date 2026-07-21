import { NextRequest, NextResponse } from "next/server";
import { verifyAccessCode } from "@/lib/host-auth";
import { runTvOfflineAlerts } from "@/lib/tv-offline-alerts";

export const maxDuration = 60;

/**
 * S0.2 fleet offline/stale alert cron.
 * Auth: Bearer CRON_SECRET or x-alerts-key (host access code).
 * ?dry=1 plans without writing or sending.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const cronOk = Boolean(
    secret && req.headers.get("authorization") === `Bearer ${secret}`
  );
  const keyOk = await verifyAccessCode(req.headers.get("x-alerts-key") ?? "");
  if (!cronOk && !keyOk) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const dry = req.nextUrl.searchParams.get("dry") === "1";
  const summary = await runTvOfflineAlerts(dry);
  return NextResponse.json(summary);
}
