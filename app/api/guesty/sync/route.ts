import { NextRequest, NextResponse } from "next/server";
import { verifyCronBearer } from "@/lib/cron-auth";
import { isHostAuthenticated } from "@/lib/host-auth";
import { syncGuestyProperties } from "@/lib/sync";

export const maxDuration = 60;

/**
 * Trigger a full Guesty sync without the dashboard — same operation as the
 * "Sync from Guesty" button.
 *
 * GET (Vercel Cron): `Authorization: Bearer ${CRON_SECRET}` only — fails closed
 * when CRON_SECRET is unset. No cookies, no ?code=.
 *
 * POST: host session cookie (dashboard "Sync from Guesty" button).
 */
async function runSync() {
  const result = await syncGuestyProperties();
  if (!result.ok) {
    return NextResponse.json(result, { status: 503 });
  }
  return NextResponse.json(result);
}

export async function GET(req: NextRequest) {
  if (!verifyCronBearer(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return runSync();
}

export async function POST(req: NextRequest) {
  if (!(await isHostAuthenticated())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return runSync();
}
