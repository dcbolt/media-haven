import { NextRequest, NextResponse } from "next/server";
import { createDriveUploadSession, driveUploadConfigured } from "@/lib/gdrive";
import { isHostAuthenticated } from "@/lib/host-auth";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * Mint a browser-direct upload URL for the media library (host request
 * 2026-07-21: upload button + drag-and-drop in the signage editor).
 *
 * The server never touches the file bytes — Vercel caps request bodies at
 * ~4.5 MB, far below a property video. Instead:
 * - Drive service account configured → Drive resumable session into the
 *   media folder (the canonical home; ask was "straight to Drive").
 * - Otherwise → signed upload URL into the public `screensavers` bucket
 *   under shared/, which lib/screensavers.ts already lists everywhere.
 *   Working uploads today; flips to Drive the moment the SA key lands.
 */

const MAX_BYTES = 512 * 1024 * 1024; // hard cap; keep videos ≤~100MB to hotlink
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
      { error: "unsupported file type — images (jpg/png/webp/avif) or videos (mp4/webm/mov)" },
      { status: 400 }
    );
  }
  if (!/^(image|video)\//.test(mimeType)) {
    return NextResponse.json({ error: "not a media file" }, { status: 400 });
  }
  if (!Number.isFinite(size) || size <= 0 || size > MAX_BYTES) {
    return NextResponse.json(
      { error: "file too large (512 MB max)" },
      { status: 400 }
    );
  }

  if (driveUploadConfigured()) {
    const session = await createDriveUploadSession(name, mimeType, size);
    if ("error" in session) {
      return NextResponse.json({ error: session.error }, { status: 502 });
    }
    return NextResponse.json({
      ok: true,
      provider: "drive",
      uploadUrl: session.uploadUrl,
    });
  }

  const db = supabaseAdmin();
  if (!db) {
    return NextResponse.json(
      { error: "no upload target — Drive service account and database both unconfigured" },
      { status: 503 }
    );
  }
  // Unique-ish path so re-uploads of the same filename don't collide.
  const path = `shared/${Date.now().toString(36)}-${name.replace(/\s+/g, "-")}`;
  const { data, error } = await db.storage
    .from("screensavers")
    .createSignedUploadUrl(path);
  if (error || !data) {
    return NextResponse.json({ error: "storage refused" }, { status: 502 });
  }
  const { data: pub } = db.storage.from("screensavers").getPublicUrl(path);
  return NextResponse.json({
    ok: true,
    provider: "supabase",
    uploadUrl: data.signedUrl,
    publicUrl: pub.publicUrl,
  });
}
