import { NextRequest, NextResponse } from "next/server";
import { isHostAuthenticated } from "@/lib/host-auth";
import { getFloridaHavensOrgId } from "@/lib/org";
import {
  canDeleteScreensaverUrl,
  deleteScreensaverUpload,
} from "@/lib/screensaver-media-delete";
import { detectScreensaverSource } from "@/lib/screensaver-media-info";
import {
  hideScreensaverUrl,
  unhideScreensaverUrl,
} from "@/lib/screensaver-hidden";
import {
  invalidateBlobScreensaverCache,
  listScreensaversIncludingOversized,
} from "@/lib/screensavers";

/**
 * Host screensaver rotation inventory actions: delete uploads, hide Drive
 * items, bulk-remove oversized uploads. Never deletes Google Drive files.
 */

export async function POST(req: NextRequest) {
  if (!(await isHostAuthenticated())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    url?: string;
    confirmed?: boolean;
  };

  if (!body.confirmed) {
    return NextResponse.json(
      { error: "confirmation required" },
      { status: 400 }
    );
  }

  const action = body.action ?? "";
  const orgId = getFloridaHavensOrgId();

  if (action === "hide") {
    const url = body.url ?? "";
    if (!url) {
      return NextResponse.json({ error: "url required" }, { status: 400 });
    }
    if (detectScreensaverSource(url) !== "google_drive") {
      return NextResponse.json(
        { error: "only Google Drive items can be hidden" },
        { status: 400 }
      );
    }
    const result = await hideScreensaverUrl(url, orgId);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true, action: "hide", url });
  }

  if (action === "unhide") {
    const url = body.url ?? "";
    if (!url) {
      return NextResponse.json({ error: "url required" }, { status: 400 });
    }
    const result = await unhideScreensaverUrl(url, orgId);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true, action: "unhide", url });
  }

  if (action === "delete") {
    const url = body.url ?? "";
    if (!url) {
      return NextResponse.json({ error: "url required" }, { status: 400 });
    }
    if (!canDeleteScreensaverUrl(url)) {
      return NextResponse.json(
        { error: "not deletable — hide Drive items instead" },
        { status: 400 }
      );
    }
    const result = await deleteScreensaverUpload(url);
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, code: result.code },
        { status: result.code === "not_deletable" ? 400 : 502 }
      );
    }
    invalidateBlobScreensaverCache();
    return NextResponse.json({ ok: true, action: "delete", url });
  }

  if (action === "bulk-delete-oversized") {
    const all = await listScreensaversIncludingOversized(null, true);
    const targets = all.filter(
      (a) => a.tooLargeForTv && canDeleteScreensaverUrl(a.url)
    );
    const deleted: string[] = [];
    const errors: { url: string; error: string }[] = [];
    for (const a of targets) {
      const result = await deleteScreensaverUpload(a.url);
      if (result.ok) deleted.push(a.url);
      else errors.push({ url: a.url, error: result.error });
    }
    if (deleted.length > 0) invalidateBlobScreensaverCache();
    return NextResponse.json({
      ok: true,
      action: "bulk-delete-oversized",
      deleted,
      errors,
    });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
