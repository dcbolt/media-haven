import { NextRequest, NextResponse } from "next/server";
import { isHostAuthenticated } from "@/lib/host-auth";
import { consumeRateLimit } from "@/lib/in-memory-rate-limit";
import { enforceSupabaseScreensaverSize } from "@/lib/supabase-screensaver-upload-enforce";
import { supabaseAdmin } from "@/lib/supabase";

const VERIFY_MAX = 24;
const VERIFY_WINDOW_MS = 60_000;

/** After Supabase PUT — HEAD object size and remove/flag if over TV cap (F-991). */
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
    publicUrl?: string;
    name?: string;
    mimeType?: string;
  };
  const publicUrl = typeof body.publicUrl === "string" ? body.publicUrl.trim() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const mimeType = typeof body.mimeType === "string" ? body.mimeType.trim() : "";
  if (!publicUrl.startsWith("http") || !name || !mimeType) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const result = await enforceSupabaseScreensaverSize(
    supabaseAdmin(),
    publicUrl,
    name,
    mimeType
  );
  return NextResponse.json(result);
}
