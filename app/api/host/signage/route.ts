import { NextRequest, NextResponse } from "next/server";
import { isHostAuthenticated } from "@/lib/host-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { signagePlaylist } from "@/lib/tv";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Publish/reset the signage playlist. A plain API route on purpose: Next
 * server actions are bound to a specific deployment via encrypted action
 * ids, and with our merge-to-deploy cadence a host's open editor tab kept
 * going stale mid-session — publishes silently dropped (host 2026-07-20).
 * Routes are stable across deploys, and the editor can surface failures
 * in-page instead of via redirect params.
 */
export async function POST(req: NextRequest) {
  if (!(await isHostAuthenticated())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    propertyId?: string;
    playlist?: unknown;
    reset?: boolean;
  };
  const propertyId = body.propertyId ?? "";
  if (!UUID_RE.test(propertyId)) {
    return NextResponse.json({ error: "bad property id" }, { status: 400 });
  }
  const db = supabaseAdmin();
  if (!db) {
    return NextResponse.json({ error: "database unavailable" }, { status: 503 });
  }

  let playlist: unknown = null;
  if (!body.reset) {
    playlist = signagePlaylist(body.playlist);
    if (!playlist) {
      return NextResponse.json(
        { error: "playlist needs at least one valid block" },
        { status: 400 }
      );
    }
  }

  // Merge over stored settings — this route owns only the playlist key.
  const { data: row, error: readError } = await db
    .from("properties")
    .select("settings")
    .eq("id", propertyId)
    .maybeSingle();
  if (readError || row === null) {
    return NextResponse.json({ error: "unknown property" }, { status: 404 });
  }
  const prev =
    row.settings && typeof row.settings === "object"
      ? (row.settings as Record<string, unknown>)
      : {};
  const { error } = await db
    .from("properties")
    .update({ settings: { ...prev, playlist } })
    .eq("id", propertyId);
  if (error) {
    return NextResponse.json({ error: "save failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, reset: Boolean(body.reset) });
}
