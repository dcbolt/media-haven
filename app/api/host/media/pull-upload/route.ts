import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { blobStoreId, blobToken } from "@/lib/blob-token";
import { isHostAuthenticated } from "@/lib/host-auth";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * G1 pull-upload: copy a Drive-hosted media file into the Vercel Blob store
 * entirely server-side. Exists because (a) browsers can't play Drive-hosted
 * video (Google 403s cross-site Sec-Fetch-Dest: video), so big media must
 * live in Blob, and (b) agent/host networks may not sustain a 250 MB+
 * browser upload — Vercel-to-Google-to-Blob transfers run inside the
 * datacenter instead.
 *
 * SSRF-safe by construction: the source is built from a Drive file id, not
 * a caller-supplied URL.
 */

export const maxDuration = 300;

const ID_RE = /^[A-Za-z0-9_-]{10,80}$/;
const MAX_BYTES = 512 * 1024 * 1024;
const EXT_RE = /\.(jpe?g|png|webp|avif|mp4|webm|mov)$/i;

export async function POST(req: NextRequest) {
  if (!(await isHostAuthenticated())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const token = blobToken();
  if (!token) {
    return NextResponse.json(
      { error: "blob read-write token not configured" },
      { status: 503 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    driveFileId?: string;
    pathname?: string;
    /** Alternative source: ≤45 MB chunks parked in the screensavers bucket
     *  (agent/host networks that can't finish one big blob PUT split the
     *  file, push chunks to Supabase — which takes large PUTs fine — and
     *  this route reassembles them server-side). Chunks are deleted after
     *  a successful put so they never linger in TV rotations. */
    chunkPaths?: string[];
  };
  const name = String(body.pathname ?? "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120);
  if (!name || !EXT_RE.test(name)) {
    return NextResponse.json(
      { error: "pathname must end in a media extension" },
      { status: 400 }
    );
  }

  if (Array.isArray(body.chunkPaths) && body.chunkPaths.length > 0) {
    const paths = body.chunkPaths.map((p) => String(p ?? ""));
    if (
      paths.length > 8 ||
      paths.some((p) => !/^shared\/[A-Za-z0-9._-]{1,120}$/.test(p))
    ) {
      return NextResponse.json({ error: "bad chunkPaths" }, { status: 400 });
    }
    const db = supabaseAdmin();
    if (!db) {
      return NextResponse.json({ error: "no database" }, { status: 503 });
    }
    const buffers: Buffer[] = [];
    for (const p of paths) {
      const { data, error } = await db.storage.from("screensavers").download(p);
      if (error || !data) {
        return NextResponse.json(
          { error: `chunk missing: ${p}` },
          { status: 400 }
        );
      }
      buffers.push(Buffer.from(await data.arrayBuffer()));
    }
    const whole = Buffer.concat(buffers);
    if (whole.length > MAX_BYTES) {
      return NextResponse.json({ error: "file too large (512 MB max)" }, { status: 400 });
    }
    const blob = await put(`screensavers/${name}`, whole, {
      access: "public",
      token,
      storeId: blobStoreId(),
      contentType: name.endsWith(".mp4") ? "video/mp4" : "application/octet-stream",
      multipart: true,
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    await db.storage.from("screensavers").remove(paths);
    return NextResponse.json({ ok: true, url: blob.url, bytes: whole.length });
  }

  const driveFileId = String(body.driveFileId ?? "").trim();
  if (!ID_RE.test(driveFileId)) {
    return NextResponse.json({ error: "bad driveFileId" }, { status: 400 });
  }

  const source = `https://drive.usercontent.google.com/download?id=${driveFileId}&export=download&confirm=t`;
  const res = await fetch(source, { redirect: "follow" });
  if (!res.ok || !res.body) {
    return NextResponse.json(
      { error: `drive fetch failed (${res.status})` },
      { status: 502 }
    );
  }
  const contentType = res.headers.get("content-type") ?? "";
  if (!/^(video|image)\//.test(contentType)) {
    // Big unshared files answer with an HTML permission/scan page.
    return NextResponse.json(
      { error: `drive served ${contentType || "unknown"} — file must be link-shared` },
      { status: 502 }
    );
  }
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > MAX_BYTES) {
    return NextResponse.json({ error: "file too large (512 MB max)" }, { status: 400 });
  }

  const blob = await put(`screensavers/${name}`, res.body, {
    access: "public",
    token,
    storeId: blobStoreId(),
    contentType,
    multipart: true,
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  return NextResponse.json({ ok: true, url: blob.url, contentType, bytes: declared });
}
