import { NextRequest, NextResponse } from "next/server";
import { isHostAuthenticated } from "@/lib/host-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { playlistHistory, signagePlaylist } from "@/lib/tv";

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
const HISTORY_MAX = 10;

export async function POST(req: NextRequest) {
  if (!(await isHostAuthenticated())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    propertyId?: string;
    playlist?: unknown;
    reset?: boolean;
    /** S0.4 rollback: timestamp of the history entry to restore. */
    restoreAt?: string;
  };
  const propertyId = body.propertyId ?? "";
  if (!UUID_RE.test(propertyId)) {
    return NextResponse.json({ error: "bad property id" }, { status: 400 });
  }
  const db = supabaseAdmin();
  if (!db) {
    return NextResponse.json({ error: "database unavailable" }, { status: 503 });
  }

  // Read first — merge over stored settings; this route owns playlist +
  // playlistHistory only.
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
  const history = playlistHistory(prev.playlistHistory);

  let playlist: unknown = null;
  if (body.restoreAt) {
    const entry = history.find((e) => e.at === body.restoreAt);
    if (!entry) {
      return NextResponse.json(
        { error: "history entry not found" },
        { status: 404 }
      );
    }
    playlist = signagePlaylist(entry.playlist);
    if (!playlist) {
      return NextResponse.json(
        { error: "history entry is no longer valid" },
        { status: 409 }
      );
    }
  } else if (!body.reset) {
    playlist = signagePlaylist(body.playlist);
    if (!playlist) {
      return NextResponse.json(
        { error: "playlist needs at least one valid block" },
        { status: 400 }
      );
    }
  }

  // S0.4 publish safety: every published (or restored) arrangement joins
  // the history, newest first — restores are themselves undoable.
  const nextHistory = playlist
    ? [
        { at: new Date().toISOString(), playlist },
        ...history.filter((e) => e.at !== body.restoreAt),
      ].slice(0, HISTORY_MAX)
    : history;

  const { error } = await db
    .from("properties")
    .update({
      settings: { ...prev, playlist, playlistHistory: nextHistory },
    })
    .eq("id", propertyId);
  if (error) {
    return NextResponse.json({ error: "save failed" }, { status: 500 });
  }
  return NextResponse.json({
    ok: true,
    reset: Boolean(body.reset),
    restored: Boolean(body.restoreAt),
  });
}
