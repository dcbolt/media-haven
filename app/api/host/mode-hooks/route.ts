import { NextRequest, NextResponse } from "next/server";
import { isHostAuthenticated } from "@/lib/host-auth";
import { loadModeHooks, saveModeHooks } from "@/lib/mode-hooks";
import { getFloridaHavensOrgId } from "@/lib/org";

/**
 * S5.4 mode transition hooks (org settings).
 * GET  — current hooks
 * POST — save { enabled?, checkInChannelId?, vacantChannelId? }
 *        Pass empty string / null to clear a channel mapping.
 */

export async function GET() {
  if (!(await isHostAuthenticated())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const hooks = await loadModeHooks(getFloridaHavensOrgId());
  return NextResponse.json({ ok: true, hooks });
}

export async function POST(req: NextRequest) {
  if (!(await isHostAuthenticated())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    enabled?: boolean;
    checkInChannelId?: string | null;
    vacantChannelId?: string | null;
  };

  const result = await saveModeHooks(
    {
      enabled: body.enabled,
      checkInChannelId:
        body.checkInChannelId === undefined
          ? undefined
          : body.checkInChannelId || null,
      vacantChannelId:
        body.vacantChannelId === undefined
          ? undefined
          : body.vacantChannelId || null,
    },
    getFloridaHavensOrgId()
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true, hooks: result.hooks });
}
