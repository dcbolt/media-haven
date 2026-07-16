import { NextRequest, NextResponse } from "next/server";
import { isHostAuthenticated, verifyAccessCode } from "@/lib/host-auth";
import { runMigrations } from "@/lib/migrate";

export const maxDuration = 60;

/**
 * Applies pending repo migrations to the database. Host-gated (cookie or
 * ?code=), idempotent, and only ever runs SQL that ships in the repo —
 * nothing from the request is executed. GET so it's one click for the host.
 */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code") ?? "";
  const authed = (await isHostAuthenticated()) || (code && verifyAccessCode(code));
  if (!authed) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await runMigrations();
  return NextResponse.json(result, {
    status: result.ok ? 200 : 409,
    headers: { "Cache-Control": "private, no-store" },
  });
}
