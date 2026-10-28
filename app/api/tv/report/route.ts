import { NextRequest, NextResponse } from "next/server";
import { readRequestBodyCapped } from "@/lib/read-json-body-capped";
import { handleTvDeviceReport } from "@/lib/tv-device-report-handle";
import { REPORT_MAX_BODY_BYTES } from "@/lib/tv-device-report-types";

export const maxDuration = 30;

function logReportRequest(deviceId: string, status: number, byteLength: number) {
  console.log(
    JSON.stringify({
      at: new Date().toISOString(),
      route: "/api/tv/report",
      deviceId,
      status,
      bytes: byteLength,
    })
  );
}

/**
 * P5 device heartbeat — soft auth (uuid-only, auth:legacy).
 * Write-only telemetry; response is { ok, nextReportS } only.
 */
export async function POST(req: NextRequest) {
  const read = await readRequestBodyCapped(
    req.body,
    REPORT_MAX_BODY_BYTES,
    req.headers.get("content-length")
  );
  if (!read.ok) {
    logReportRequest("unknown", 413, REPORT_MAX_BODY_BYTES + 1);
    return NextResponse.json({ ok: false }, { status: 413 });
  }

  void req.headers.get("authorization");

  let body: unknown;
  let deviceId = "unknown";
  try {
    body = read.text ? JSON.parse(read.text) : null;
    if (body && typeof body === "object" && !Array.isArray(body)) {
      const id = (body as { deviceId?: unknown }).deviceId;
      if (typeof id === "string" && id.trim()) deviceId = id.trim();
    }
  } catch {
    logReportRequest(deviceId, 400, read.byteLength);
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const result = await handleTvDeviceReport(body);
  if (!result.ok) {
    logReportRequest(deviceId, result.status, read.byteLength);
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

  logReportRequest(deviceId, 200, read.byteLength);
  return NextResponse.json({
    ok: true,
    nextReportS: result.nextReportS,
  });
}
