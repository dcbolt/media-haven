import { NextRequest, NextResponse } from "next/server";
import { isHostAuthenticated } from "@/lib/host-auth";
import {
  deleteChannel,
  getChannel,
  loadChannels,
  saveChannel,
} from "@/lib/channels";
import { getFloridaHavensOrgId } from "@/lib/org";
import { playlistHistory, signagePlaylist } from "@/lib/tv";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * S1.5 channels API.
 * GET  — list org channels
 * POST — save { name, playlist, propertyIds? } | delete { deleteId } |
 *        apply { applyId, propertyId?, allProperties? } via same write
 *        path as S0.5 signage publish (per-property history).
 */

const HISTORY_MAX = 10;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET() {
  if (!(await isHostAuthenticated())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const channels = await loadChannels(getFloridaHavensOrgId());
  return NextResponse.json({
    ok: true,
    channels: channels.map((c) => ({
      id: c.id,
      name: c.name,
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
    playlist?: unknown;
    propertyIds?: string[];
    id?: string;
    deleteId?: string;
    applyId?: string;
    propertyId?: string;
    allProperties?: boolean;
  };

  const orgId = getFloridaHavensOrgId();

  if (body.deleteId) {
    const result = await deleteChannel(body.deleteId, orgId);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  }

  if (body.applyId) {
    const channel = await getChannel(body.applyId, orgId);
    if (!channel) {
      return NextResponse.json({ error: "channel not found" }, { status: 404 });
    }
    const playlist = signagePlaylist(channel.playlist);
    if (!playlist) {
      return NextResponse.json({ error: "channel playlist invalid" }, { status: 409 });
    }
    const db = supabaseAdmin();
    if (!db) {
      return NextResponse.json({ error: "database unavailable" }, { status: 503 });
    }

    // Same write path as S0.5: each property gets own history snapshot.
    let targets: string[] = [];
    if (body.allProperties) {
      const { data: all } = await db.from("properties").select("id");
      targets = (all ?? []).map((r) => r.id as string);
    } else if (body.propertyId && UUID_RE.test(body.propertyId)) {
      targets = [body.propertyId];
    } else if (channel.propertyIds.length > 0) {
      targets = channel.propertyIds;
    } else {
      return NextResponse.json(
        { error: "propertyId or allProperties required" },
        { status: 400 }
      );
    }

    const at = new Date().toISOString();
    let applied = 0;
    for (const pid of targets) {
      const { data: row } = await db
        .from("properties")
        .select("settings")
        .eq("id", pid)
        .maybeSingle();
      if (!row) continue;
      const s =
        row.settings && typeof row.settings === "object"
          ? (row.settings as Record<string, unknown>)
          : {};
      const h = playlistHistory(s.playlistHistory);
      const { error } = await db
        .from("properties")
        .update({
          settings: {
            ...s,
            playlist,
            playlistHistory: [{ at, playlist }, ...h].slice(0, HISTORY_MAX),
          },
        })
        .eq("id", pid);
      if (!error) applied++;
    }
    if (applied === 0) {
      return NextResponse.json({ error: "apply failed" }, { status: 500 });
    }
    return NextResponse.json({
      ok: true,
      applied,
      name: channel.name,
    });
  }

  // Save channel pack
  const result = await saveChannel(
    {
      name: body.name ?? "",
      playlist: body.playlist,
      propertyIds: body.propertyIds,
      id: body.id,
    },
    orgId
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true, channel: result.channel });
}
