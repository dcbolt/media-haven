import { NextRequest, NextResponse } from "next/server";
import { isHostAuthenticated } from "@/lib/host-auth";
import { getFloridaHavensOrgId } from "@/lib/org";
import {
  clearEmergencyTakeover,
  loadEmergencyTakeover,
  setEmergencyTakeover,
  type TakeoverKind,
} from "@/lib/takeover";

/**
 * S1.3b fleet emergency takeover (storm / water / custom).
 * GET  — current active takeover (or null)
 * POST — set { kind, title?, body?, ttlMinutes? } or { clear: true }
 */

export async function GET() {
  if (!(await isHostAuthenticated())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const takeover = await loadEmergencyTakeover(getFloridaHavensOrgId());
  return NextResponse.json({ ok: true, takeover });
}

export async function POST(req: NextRequest) {
  if (!(await isHostAuthenticated())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    clear?: boolean;
    kind?: string;
    title?: string;
    body?: string;
    ttlMinutes?: number;
  };

  if (body.clear) {
    const result = await clearEmergencyTakeover(getFloridaHavensOrgId());
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true, takeover: null });
  }

  const kindRaw = String(body.kind ?? "storm");
  const kind: TakeoverKind =
    kindRaw === "storm" || kindRaw === "water" || kindRaw === "custom"
      ? kindRaw
      : "storm";

  const result = await setEmergencyTakeover(
    {
      kind,
      title: body.title,
      body: body.body,
      ttlMinutes: body.ttlMinutes,
    },
    getFloridaHavensOrgId()
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true, takeover: result.takeover });
}
