import { NextRequest, NextResponse } from "next/server";
import {
  deleteCampaign,
  loadCampaigns,
  saveCampaign,
} from "@/lib/campaigns";
import { isHostAuthenticated } from "@/lib/host-auth";
import { getFloridaHavensOrgId } from "@/lib/org";

/**
 * S1.1 calendar campaigns API.
 * GET  — list org campaigns
 * POST — save { name, startDate, endDate, playlist, propertyIds? } |
 *        delete { deleteId }
 *
 * Campaigns live on orgs.settings and are resolved at TV poll time —
 * they do not rewrite property playlists (so history stays clean).
 */

export async function GET() {
  if (!(await isHostAuthenticated())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const campaigns = await loadCampaigns(getFloridaHavensOrgId());
  return NextResponse.json({
    ok: true,
    campaigns: campaigns.map((c) => ({
      id: c.id,
      name: c.name,
      startDate: c.startDate,
      endDate: c.endDate,
      blocks: c.playlist.items.length,
      media: c.playlist.items.filter((it) => it.url).length,
      propertyIds: c.propertyIds,
      setAt: c.setAt,
    })),
  });
}

export async function POST(req: NextRequest) {
  if (!(await isHostAuthenticated())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    startDate?: string;
    endDate?: string;
    playlist?: unknown;
    propertyIds?: string[];
    id?: string;
    deleteId?: string;
  };

  const orgId = getFloridaHavensOrgId();

  if (body.deleteId) {
    const result = await deleteCampaign(body.deleteId, orgId);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  }

  if (!body.name || !body.startDate || !body.endDate) {
    return NextResponse.json(
      { error: "name, startDate, and endDate required" },
      { status: 400 }
    );
  }

  const result = await saveCampaign(
    {
      name: body.name,
      startDate: body.startDate,
      endDate: body.endDate,
      playlist: body.playlist,
      propertyIds: body.propertyIds,
      id: body.id,
    },
    orgId
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  const c = result.campaign;
  return NextResponse.json({
    ok: true,
    campaign: {
      id: c.id,
      name: c.name,
      startDate: c.startDate,
      endDate: c.endDate,
      blocks: c.playlist.items.length,
      media: c.playlist.items.filter((it) => it.url).length,
      propertyIds: c.propertyIds,
      setAt: c.setAt,
    },
  });
}
