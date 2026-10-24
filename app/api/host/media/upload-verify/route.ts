import { NextRequest, NextResponse } from "next/server";
import { isHostAuthenticated } from "@/lib/host-auth";
import { consumeRateLimit } from "@/lib/in-memory-rate-limit";
import {
  runHostMediaUploadVerify,
  screensaverStorageReaderFromDb,
} from "@/lib/host-media-upload-verify";
import { supabaseAdmin } from "@/lib/supabase";

const VERIFY_MAX = 24;
const VERIFY_WINDOW_MS = 60_000;

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
  const result = await runHostMediaUploadVerify(
    body,
    screensaverStorageReaderFromDb(supabaseAdmin())
  );
  if (!result.ok) {
    return NextResponse.json(result.body, { status: result.status });
  }
  return NextResponse.json(result.body);
}
