import { NextRequest, NextResponse } from "next/server";
import { isHostAuthenticated } from "@/lib/host-auth";
import { canPurgeBlobAtSource, mediaSourceKind } from "@/lib/media-library";
import {
  buildMediaUsageIndex,
  stripUrlsFromPlaylists,
  type PropertyPlaylistRow,
} from "@/lib/media-usage";
import {
  bulkUpsertMediaMeta,
  loadMediaMeta,
  MEDIA_TRASH_RETENTION_MS,
} from "@/lib/media-meta";
import { getFloridaHavensOrgId } from "@/lib/org";
import { purgeTrashedBlobUrl, trashEntriesReadyForPurge } from "@/lib/media-trash";
import { supabaseAdmin } from "@/lib/supabase";

async function loadOrgProperties(): Promise<PropertyPlaylistRow[]> {
  const db = supabaseAdmin();
  if (!db) return [];
  const { data } = await db
    .from("properties")
    .select("id, name, settings")
    .order("name");
  return (data as PropertyPlaylistRow[]) ?? [];
}

export async function GET() {
  if (!(await isHostAuthenticated())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const map = await loadMediaMeta(getFloridaHavensOrgId());
  const now = Date.now();
  const trashed = Object.entries(map)
    .filter(([, e]) => e.trashedAt || e.hidden)
    .map(([url, e]) => ({
      url,
      trashedAt: e.trashedAt ?? null,
      hidden: Boolean(e.hidden),
      purgeAfterMs: e.trashedAt
        ? Math.max(0, MEDIA_TRASH_RETENTION_MS - (now - Date.parse(e.trashedAt)))
        : null,
    }));
  return NextResponse.json({ ok: true, trashed, retentionDays: 30 });
}

export async function POST(req: NextRequest) {
  if (!(await isHostAuthenticated())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    urls?: string[];
    removeFromTimelines?: boolean;
  };
  const action = body.action ?? "";
  const urls = Array.isArray(body.urls)
    ? body.urls.filter((u) => typeof u === "string" && u.startsWith("http"))
    : [];
  const orgId = getFloridaHavensOrgId();
  const nowIso = new Date().toISOString();

  if (action === "restore") {
    const patches = urls.map((url) => ({
      url,
      patch: { trashedAt: null, hidden: null as null },
    }));
    const r = await bulkUpsertMediaMeta(patches, orgId);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    return NextResponse.json({ ok: true, restored: urls.length });
  }

  if (action === "purge_expired") {
    const map = await loadMediaMeta(orgId);
    const ready = trashEntriesReadyForPurge(map);
    let purged = 0;
    const errors: string[] = [];
    for (const url of ready) {
      const r = await purgeTrashedBlobUrl(url);
      if (r.ok) purged += 1;
      else errors.push(`${url}: ${r.error}`);
    }
    return NextResponse.json({ ok: true, purged, errors });
  }

  if (action === "remove") {
    const properties = await loadOrgProperties();
    const usage = buildMediaUsageIndex(properties);
    const used = urls.filter((u) => (usage[u]?.length ?? 0) > 0);
    if (used.length > 0 && !body.removeFromTimelines) {
      return NextResponse.json(
        {
          error: "used_in_playlist",
          used: used.map((u) => ({ url: u, refs: usage[u] })),
        },
        { status: 409 }
      );
    }

    const patches = urls.map((url) => {
      const kind = mediaSourceKind(url);
      if (kind === "blob") {
        return { url, patch: { trashedAt: nowIso, hidden: null as null } };
      }
      return { url, patch: { hidden: true, trashedAt: nowIso } };
    });
    const r = await bulkUpsertMediaMeta(patches, orgId);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });

    let timelinesUpdated = 0;
    if (body.removeFromTimelines && urls.length > 0) {
      const urlSet = new Set(urls);
      const db = supabaseAdmin();
      if (db) {
        for (const p of properties) {
          const prev =
            p.settings && typeof p.settings === "object"
              ? (p.settings as Record<string, unknown>)
              : {};
          const { next, changed } = stripUrlsFromPlaylists(prev, urlSet);
          if (changed) {
            timelinesUpdated += 1;
            await db
              .from("properties")
              .update({ settings: next })
              .eq("id", p.id);
          }
        }
      }
    }

    return NextResponse.json({
      ok: true,
      removed: urls.length,
      hiddenOnly: urls.filter((u) => !canPurgeBlobAtSource(u)).length,
      timelinesUpdated,
    });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
