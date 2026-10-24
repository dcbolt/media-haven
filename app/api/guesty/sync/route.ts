import { NextRequest, NextResponse } from "next/server";
import { isHostAuthenticated, verifyAccessCode } from "@/lib/host-auth";
import { syncGuestyProperties } from "@/lib/sync";

export const maxDuration = 60;

function syncAuthorized(req: NextRequest): Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  const cronOk = Boolean(
    secret && req.headers.get("authorization") === `Bearer ${secret}`
  );
  if (cronOk) return Promise.resolve(true);
  const code =
    req.nextUrl.searchParams.get("code") ??
    req.headers.get("x-host-code") ??
    "";
  if (code.length > 0) return verifyAccessCode(code);
  return isHostAuthenticated();
}

/**
 * Trigger a full Guesty sync without the dashboard — same operation as the
 * "Sync from Guesty" button. Lets external schedulers (Vercel Cron, scripts)
 * run the sync headlessly.
 *
 * Auth (any one):
 * - `Authorization: Bearer ${CRON_SECRET}` (Vercel Cron when CRON_SECRET is set)
 * - Host session cookie
 * - `?code=<HOST_ACCESS_CODE>` or `x-host-code` header
 *
 * GET for cron ticks; POST for manual/dashboard triggers.
 */
async function runSync(req: NextRequest) {
  if (!(await syncAuthorized(req))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await syncGuestyProperties();
  if (!result.ok) {
    return NextResponse.json(result, { status: 503 });
  }
  return NextResponse.json(result);
}

export async function GET(req: NextRequest) {
  return runSync(req);
}

export async function POST(req: NextRequest) {
  return runSync(req);
}
