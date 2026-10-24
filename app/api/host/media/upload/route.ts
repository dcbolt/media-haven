import { NextRequest, NextResponse } from "next/server";
import { createDriveUploadSession, driveUploadConfigured } from "@/lib/gdrive";
import { isHostAuthenticated } from "@/lib/host-auth";
import {
  MAX_TV_VIDEO_BYTES,
  isVideoMedia,
  uploadSizeRejection,
} from "@/lib/media-upload-limits";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * Mint a browser-direct upload URL for the media library (host request
 * 2026-07-21: upload button + drag-and-drop in the signage editor).
 */

const EXT_RE = /\.(jpe?g|png|webp|avif|mp4|webm|mov)$/i;

export async function POST(req: NextRequest) {
  if (!(await isHostAuthenticated())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    mimeType?: string;
    size?: number;
  };
  const name = (body.name ?? "")
    .replace(/[/\\<>:"|?*\u0000-\u001f]/g, "_")
    .slice(0, 120)
    .trim();
  const mimeType = body.mimeType ?? "";
  const size = Number(body.size);
  if (!name || !EXT_RE.test(name)) {
    return NextResponse.json(
      {
        error:
          "unsupported file type — images (jpg/png/webp/avif) or videos (mp4/webm/mov)",
      },
      { status: 400 }
    );
  }
  if (!/^(image|video)\//.test(mimeType)) {
    console.log("[media-upload]", {
      route: "api/host/media/upload",
      name,
      size,
      type: mimeType,
      result: "rejected",
      reason: "not a media file",
    });
    return NextResponse.json({ error: "not a media file" }, { status: 400 });
  }
  if (isVideoMedia(mimeType, name) && size > MAX_TV_VIDEO_BYTES) {
    const reason = `video too large for TVs (max ${Math.floor(MAX_TV_VIDEO_BYTES / (1024 * 1024))} MB — use a lower-bitrate encode)`;
    console.log("[media-upload]", {
      route: "api/host/media/upload",
      name,
      size,
      type: mimeType,
      result: "rejected",
      reason,
      provider: "supabase",
    });
    return NextResponse.json({ error: reason }, { status: 400 });
  }
  const sizeReject = uploadSizeRejection(name, mimeType, size);
  if (sizeReject) {
    console.log("[media-upload]", {
      route: "api/host/media/upload",
      name,
      size,
      type: mimeType,
      result: "rejected",
      reason: sizeReject,
    });
    return NextResponse.json({ error: sizeReject }, { status: 400 });
  }

  if (driveUploadConfigured()) {
    const session = await createDriveUploadSession(name, mimeType, size);
    if ("error" in session) {
      console.log("[media-upload]", {
        route: "api/host/media/upload",
        name,
        size,
        type: mimeType,
        result: "error",
        provider: "drive",
        message: session.error,
      });
      return NextResponse.json({ error: session.error }, { status: 502 });
    }
    console.log("[media-upload]", {
      route: "api/host/media/upload",
      name,
      size,
      type: mimeType,
      result: "session_ok",
      provider: "drive",
    });
    return NextResponse.json({
      ok: true,
      provider: "drive",
      uploadUrl: session.uploadUrl,
    });
  }

  const db = supabaseAdmin();
  if (!db) {
    return NextResponse.json(
      {
        error:
          "no upload target — Drive service account and database both unconfigured",
      },
      { status: 503 }
    );
  }
  const path = `shared/${Date.now().toString(36)}-${name.replace(/\s+/g, "-")}`;
  const { data, error } = await db.storage
    .from("screensavers")
    .createSignedUploadUrl(path);
  if (error || !data) {
    console.log("[media-upload]", {
      route: "api/host/media/upload",
      name,
      size,
      type: mimeType,
      result: "error",
      provider: "supabase",
    });
    return NextResponse.json({ error: "storage refused" }, { status: 502 });
  }
  const { data: pub } = db.storage.from("screensavers").getPublicUrl(path);
  console.log("[media-upload]", {
    route: "api/host/media/upload",
    name,
    size,
    type: mimeType,
    result: "session_ok",
    provider: "supabase",
  });
  return NextResponse.json({
    ok: true,
    provider: "supabase",
    uploadUrl: data.signedUrl,
    publicUrl: pub.publicUrl,
    storagePath: path,
  });
}
