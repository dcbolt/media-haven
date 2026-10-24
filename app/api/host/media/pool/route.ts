import { NextResponse } from "next/server";
import { isHostAuthenticated } from "@/lib/host-auth";
import { allTags, loadMediaMeta, type MediaMetaMap } from "@/lib/media-meta";
import { loadCampaigns } from "@/lib/campaigns";
import { buildMediaUsageIndex } from "@/lib/media-usage";
import { getFloridaHavensOrgId } from "@/lib/org";
import { listScreensavers } from "@/lib/screensavers";
import { supabaseAdmin } from "@/lib/supabase";

async function loadOrgProperties() {
  const db = supabaseAdmin();
  if (!db) return [];
  const { data } = await db
    .from("properties")
    .select("id, name, settings")
    .order("name");
  return data ?? [];
}

function mergePool(meta: MediaMetaMap) {
  return listScreensavers(null).then((screensavers) => {
    const seen = new Set<string>();
    return screensavers
      .filter((a) => {
        if (seen.has(a.url)) return false;
        seen.add(a.url);
        return true;
      })
      .map((a) => {
        const m = meta[a.url];
        if (!m) return a;
        return {
          ...a,
          ...(m.title ? { title: m.title } : null),
          ...(m.tags.length ? { tags: m.tags } : null),
          ...(m.expiresAt ? { expiresAt: m.expiresAt } : null),
          ...(m.startsAt ? { startsAt: m.startsAt } : null),
          ...(m.trashedAt ? { trashedAt: m.trashedAt } : null),
          ...(m.hidden ? { hidden: m.hidden } : null),
          ...(m.createdAt ? { createdAt: m.createdAt } : null),
          ...(m.sizeBytes != null ? { sizeBytes: m.sizeBytes } : null),
        };
      });
  });
}

export async function GET() {
  if (!(await isHostAuthenticated())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const orgId = getFloridaHavensOrgId();
  const meta = await loadMediaMeta(orgId);
  const pool = await mergePool(meta);
  const properties = await loadOrgProperties();
  const campaigns = await loadCampaigns(orgId);
  const usageByUrl = buildMediaUsageIndex(
    properties,
    campaigns.map((c) => ({ id: c.id, name: c.name, playlist: c.playlist }))
  );
  return NextResponse.json({
    ok: true,
    pool,
    usageByUrl,
    knownTags: allTags(meta),
  });
}
