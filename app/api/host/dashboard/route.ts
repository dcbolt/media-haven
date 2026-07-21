import { NextRequest, NextResponse } from "next/server";
import { isHostAuthenticated } from "@/lib/host-auth";
import {
  mintToken,
  pairTv,
  renameGuest,
  syncGuesty,
  type DashboardResult,
} from "@/lib/dashboard-ops";

/**
 * Host dashboard ops (mint QR, pair TV, rename guest, Guesty sync).
 * Deploy-proof API — replaces app/host/actions.ts server actions.
 */

const OPS: Record<string, (fd: FormData) => Promise<DashboardResult>> = {
  mint: mintToken,
  pair: pairTv,
  "rename-guest": renameGuest,
  sync: syncGuesty,
};

export async function POST(req: NextRequest) {
  if (!(await isHostAuthenticated())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const fd = await req.formData().catch(() => null);
  if (!fd) {
    return NextResponse.json({ error: "bad form data" }, { status: 400 });
  }
  const op = OPS[String(fd.get("op") ?? "")];
  if (!op) {
    return NextResponse.json({ error: "unknown op" }, { status: 400 });
  }
  const result = await op(fd);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({
    ok: true,
    ...(result.redirect ? { redirect: result.redirect } : null),
  });
}
