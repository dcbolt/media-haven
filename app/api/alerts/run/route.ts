import { NextRequest, NextResponse } from "next/server";
import { runLaunchAlerts } from "@/lib/alerts";
import { verifyAccessCode } from "@/lib/host-auth";

export const maxDuration = 60;

/**
 * Launch-alert cron tick (Phase 1.8). Idempotent — safe on any schedule.
 * Auth, either of:
 * - `Authorization: Bearer ${CRON_SECRET}` (Vercel Cron sets this when the
 *   CRON_SECRET env var exists)
 * - `x-alerts-key: <host access code>` for manual/scripted runs
 * `?dry=1` plans (which launches/kinds are due, who would get them)
 * without sending or logging.
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
  const base = req.nextUrl.origin;
  const summary = await runLaunchAlerts(base, dry);
  return NextResponse.json(summary);
}
