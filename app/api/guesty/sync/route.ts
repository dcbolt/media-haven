import { NextRequest, NextResponse } from "next/server";
import { isHostAuthenticated, verifyAccessCode } from "@/lib/host-auth";
import { syncGuestyProperties } from "@/lib/sync";

/**
 * Trigger a full Guesty sync without the dashboard — same operation as the
 * "Sync from Guesty" button. Lets external schedulers (and Claude) run the
 * sync headlessly, e.g. to backfill new reservation columns.
 *
 * Auth: host session cookie OR ?code=<HOST_ACCESS_CODE> / x-host-code
 * header. POST only — a sync writes properties, reservations, and tokens.
 */
export async function POST(req: NextRequest) {
  const code =
    req.nextUrl.searchParams.get("code") ??
    req.headers.get("x-host-code") ??
    "";
  const authed =
    (await isHostAuthenticated()) || (code.length > 0 && verifyAccessCode(code));
  if (!authed) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await syncGuestyProperties();
  if (!result.ok) {
    return NextResponse.json(result, { status: 503 });
  }
  return NextResponse.json(result);
}
