import { NextRequest, NextResponse } from "next/server";
import { isHostAuthenticated } from "@/lib/host-auth";
import { consumeRateLimit } from "@/lib/in-memory-rate-limit";
import { enforceSupabaseScreensaverSize } from "@/lib/supabase-screensaver-upload-enforce";
import { screensaverListingContainsUrl } from "@/lib/screensavers";
import { supabaseAdmin } from "@/lib/supabase";

const LISTING_CHECK_MAX = 12;
const LISTING_CHECK_WINDOW_MS = 60_000;

/** After Blob upload — confirm URL appears in a fresh listing (cache bypass). */
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
    name?: string;
    mimeType?: string;
  };
  const url = typeof body.url === "string" ? body.url.trim() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const mimeType = typeof body.mimeType === "string" ? body.mimeType.trim() : "";
  if (!url.startsWith("http")) {
    return NextResponse.json({ error: "bad url" }, { status: 400 });
  }
  if (name && mimeType) {
    const enforced = await enforceSupabaseScreensaverSize(
      supabaseAdmin(),
      url,
      name,
      mimeType
    );
    if (enforced.tooLargeForTv) {
      return NextResponse.json({
        ok: true,
        listed: false,
        url,
        tooLargeForTv: true,
        removed: enforced.removed,
        reason: enforced.reason,
      });
    }
  }
  const listed = await screensaverListingContainsUrl(url, null);
  return NextResponse.json({ ok: true, listed, url });
}
