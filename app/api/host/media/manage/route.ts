import { NextRequest, NextResponse } from "next/server";
import { isHostAuthenticated } from "@/lib/host-auth";
import { loadCampaigns } from "@/lib/campaigns";
import { canPurgeBlobAtSource, mediaSourceKind } from "@/lib/media-library";
import {
  buildMediaUsageIndex,
  stripUrlsFromCampaignsMap,
  stripUrlsFromPlaylists,
  type PropertyPlaylistRow,
} from "@/lib/media-usage";
import { bulkUpsertMediaMeta, loadMediaMeta } from "@/lib/media-meta";
import { getFloridaHavensOrgId } from "@/lib/org";
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
  const trashed = Object.entries(map)
    .filter(([, e]) => e.trashedAt || e.hidden)
    .map(([url, e]) => ({
      url,
      trashedAt: e.trashedAt ?? null,
      hidden: Boolean(e.hidden),
    }));
  return NextResponse.json({ ok: true, trashed, restorable: true });
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

  if (action === "remove") {
    const properties = await loadOrgProperties();
    const campaigns = await loadCampaigns(orgId);
    const usage = buildMediaUsageIndex(
      properties,
      campaigns.map((c) => ({ id: c.id, name: c.name, playlist: c.playlist }))
    );
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

        const { data: orgRow } = await db
          .from("orgs")
          .select("settings")
          .eq("id", orgId)
          .maybeSingle();
        const prevSettings =
          orgRow?.settings && typeof orgRow.settings === "object"
            ? (orgRow.settings as Record<string, unknown>)
            : {};
        const { next: campaignsNext, changed: campaignsChanged } =
          stripUrlsFromCampaignsMap(prevSettings.campaigns, urlSet);
        if (campaignsChanged) {
          timelinesUpdated += 1;
          await db
            .from("orgs")
            .update({
              settings: { ...prevSettings, campaigns: campaignsNext },
            })
            .eq("id", orgId);
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
