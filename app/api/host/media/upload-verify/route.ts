import { NextRequest, NextResponse } from "next/server";
import { isHostAuthenticated } from "@/lib/host-auth";
import { consumeRateLimit } from "@/lib/in-memory-rate-limit";
import { enforceSupabaseScreensaverSize } from "@/lib/supabase-screensaver-upload-enforce";
import { supabaseAdmin } from "@/lib/supabase";

const VERIFY_MAX = 24;
const VERIFY_WINDOW_MS = 60_000;

function screensaverStorageReader() {
  const db = supabaseAdmin();
  if (!db) return null;
  return {
    list: (folder: string, opts?: { limit?: number; search?: string }) =>
      db.storage.from("screensavers").list(folder, opts),
  };
}

/** After Supabase PUT — flag oversized videos from Storage metadata (F-1002). */
export async function POST(req: NextRequest) {
  if (!(await isHostAuthenticated())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";
  const hostCookie = req.cookies.get("fh_host")?.value?.slice(0, 32) ?? "anon";
  const limited = consumeRateLimit(
    `upload-verify:${ip}:${hostCookie}`,
    VERIFY_MAX,
    VERIFY_WINDOW_MS
  );
  if (!limited.ok) {
    return NextResponse.json(
      { error: "too many verify requests" },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSec) } }
    );
  }
  const body = (await req.json().catch(() => ({}))) as {
    storagePath?: string;
    publicUrl?: string;
    name?: string;
    mimeType?: string;
  };
  const storagePath =
    typeof body.storagePath === "string" ? body.storagePath.trim() : "";
  const publicUrl =
    typeof body.publicUrl === "string" ? body.publicUrl.trim() : "";
  if (!storagePath && !publicUrl) {
    return NextResponse.json({ error: "storagePath or publicUrl required" }, { status: 400 });
  }
  const result = await enforceSupabaseScreensaverSize(screensaverStorageReader(), {
    storagePath: storagePath || null,
    publicUrl: publicUrl || null,
    name: body.name,
    mimeType: body.mimeType,
  });
  return NextResponse.json(result);
}
