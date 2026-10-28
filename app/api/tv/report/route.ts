import { NextRequest, NextResponse } from "next/server";
import { handleTvDeviceReport } from "@/lib/tv-device-report-handle";
import { REPORT_MAX_BODY_BYTES } from "@/lib/tv-device-report-types";

export const maxDuration = 30;

/**
 * P5 device heartbeat — soft auth (uuid-only, auth:legacy).
 * Does not return feed content, settings, or tokens. Never creates tv_devices rows.
 */
export async function POST(req: NextRequest) {
  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (contentLength > REPORT_MAX_BODY_BYTES) {
    return NextResponse.json(
      { ok: false, error: "payload too large" },
      { status: 413 }
    );
  }

  const rawText = await req.text();
  if (Buffer.byteLength(rawText, "utf8") > REPORT_MAX_BODY_BYTES) {
    return NextResponse.json(
      { ok: false, error: "payload too large" },
      { status: 413 }
    );
  }

  // Bearer present or not — soft mode records legacy only (no token table yet).
  void req.headers.get("authorization");

  let body: unknown;
  try {
    body = rawText ? JSON.parse(rawText) : null;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid json" },
      { status: 400 }
    );
  }

  const result = await handleTvDeviceReport(body);
  if (!result.ok) {
    if (result.status === 404) {
      return NextResponse.json({ ok: false }, { status: 404 });
    }
    if (result.status === 429) {
      return NextResponse.json(
        { ok: false },
        {
          status: 429,
          headers: { "Retry-After": String(result.retryAfterSec) },
        }
      );
    }
    return NextResponse.json(
      { ok: false, error: result.error ?? "error" },
      { status: result.status }
    );
  }

  return NextResponse.json({
    ok: true,
    nextReportS: result.nextReportS,
    rejectedChildren: result.rejectedChildren,
  });
}
