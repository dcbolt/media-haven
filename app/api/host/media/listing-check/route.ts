import { NextRequest, NextResponse } from "next/server";
import { isHostAuthenticated } from "@/lib/host-auth";
import { consumeRateLimit } from "@/lib/in-memory-rate-limit";
import { enforceSupabaseScreensaverSize } from "@/lib/supabase-screensaver-upload-enforce";
import { screensaverListingContainsUrl } from "@/lib/screensavers";
import { supabaseAdmin } from "@/lib/supabase";

const LISTING_CHECK_MAX = 12;
const LISTING_CHECK_WINDOW_MS = 60_000;

function screensaverStorageReader() {
  const db = supabaseAdmin();
  if (!db) return null;
  return {
    list: (folder: string, opts?: { limit?: number; search?: string }) =>
      db.storage.from("screensavers").list(folder, opts),
  };
}

/** After upload — confirm URL appears in a fresh listing (cache bypass). */
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
    `listing-check:${ip}:${hostCookie}`,
    LISTING_CHECK_MAX,
    LISTING_CHECK_WINDOW_MS
  );
  if (!limited.ok) {
    return NextResponse.json(
      { error: "too many listing checks — wait and retry" },
      {
        status: 429,
        headers: { "Retry-After": String(limited.retryAfterSec) },
      }
    );
  }
  const body = (await req.json().catch(() => ({}))) as {
    url?: string;
    storagePath?: string;
    name?: string;
    mimeType?: string;
  };
  const url = typeof body.url === "string" ? body.url.trim() : "";
  const storagePath =
    typeof body.storagePath === "string" ? body.storagePath.trim() : "";
  if (!url.startsWith("http")) {
    return NextResponse.json({ error: "bad url" }, { status: 400 });
  }

  let tooLargeForTv = false;
  let flagReason: string | undefined;
  if (storagePath || url.includes(".supabase.co/storage/")) {
    const flagged = await enforceSupabaseScreensaverSize(
      screensaverStorageReader(),
      {
        storagePath: storagePath || null,
        publicUrl: url,
        name: body.name,
        mimeType: body.mimeType,
      }
    );
    if (flagged.flagged) {
      tooLargeForTv = true;
      flagReason = flagged.reason;
    }
  }

  const listed = await screensaverListingContainsUrl(url, null);
  return NextResponse.json({
    ok: true,
    listed,
    url,
    tooLargeForTv,
    reason: flagReason,
  });
}
