import { NextRequest, NextResponse } from "next/server";
import { isHostAuthenticated } from "@/lib/host-auth";
import {
  loadMediaMeta,
  upsertMediaMeta,
  type MediaMetaEntry,
} from "@/lib/media-meta";
import { getFloridaHavensOrgId } from "@/lib/org";

/**
 * S2.1 media library metadata API.
 * GET  → full org mediaMeta map
 * PATCH → upsert one URL's title/tags/expiresAt
 *
 * Plain route (not server action) so long-lived host tabs survive deploys.
 */

export async function GET() {
  if (!(await isHostAuthenticated())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const map = await loadMediaMeta(getFloridaHavensOrgId());
  return NextResponse.json({ ok: true, mediaMeta: map });
}

export async function PATCH(req: NextRequest) {
  if (!(await isHostAuthenticated())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    url?: string;
    title?: string | null;
    tags?: string[];
    expiresAt?: string | null;
  };
  const url = body.url ?? "";
  if (!url) {
    return NextResponse.json({ error: "url required" }, { status: 400 });
  }

  const patch: {
    title?: string | null;
    tags?: string[];
    expiresAt?: string | null;
  } = {};
  if ("title" in body) patch.title = body.title;
  if ("tags" in body && Array.isArray(body.tags)) patch.tags = body.tags;
  if ("expiresAt" in body) patch.expiresAt = body.expiresAt;

  const result = await upsertMediaMeta(url, patch, getFloridaHavensOrgId());
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({
    ok: true,
    entry: result.entry as MediaMetaEntry | null,
  });
}
