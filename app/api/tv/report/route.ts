import { NextRequest, NextResponse } from "next/server";
import { readRequestBodyCapped } from "@/lib/read-json-body-capped";
import { handleTvDeviceReport } from "@/lib/tv-device-report-handle";
import { parseDeviceReportPayload } from "@/lib/tv-device-report-parse";
import { REPORT_MAX_BODY_BYTES } from "@/lib/tv-device-report-types";
import { deviceIdForLog } from "@/lib/tv-device-id";
import { consumeReportRejectBudget } from "@/lib/tv-report-reject-limit";

export const maxDuration = 30;

function clientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

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

function rejectResponse(
  req: NextRequest,
  deviceId: string,
  status: number,
  byteLength: number,
  body: Record<string, unknown>
) {
  const budget = consumeReportRejectBudget(clientIp(req));
  if (!budget.ok) {
    logReportRequest(deviceId, 429, byteLength);
    return NextResponse.json(
      { ok: false },
      { status: 429, headers: { "Retry-After": String(budget.retryAfterSec) } }
    );
  }
  logReportRequest(deviceId, status, byteLength);
  return NextResponse.json(body, { status });
}

/**
 * P5 device heartbeat — soft auth (uuid-only, auth:legacy).
 */
export async function POST(req: NextRequest) {
  const read = await readRequestBodyCapped(
    req.body,
    REPORT_MAX_BODY_BYTES,
    req.headers.get("content-length")
  );
  if (!read.ok) {
    return rejectResponse(req, "invalid", 413, REPORT_MAX_BODY_BYTES + 1, {
      ok: false,
    });
  }

  void req.headers.get("authorization");

  let body: unknown;
  try {
    body = read.text ? JSON.parse(read.text) : null;
  } catch {
    return rejectResponse(req, "invalid", 400, read.byteLength, {
      ok: false,
      error: "invalid json",
    });
  }

  const parsedEarly = parseDeviceReportPayload(body);
  const logId = parsedEarly.ok
    ? parsedEarly.report.deviceId
    : deviceIdForLog(
        body && typeof body === "object" && !Array.isArray(body)
          ? (body as { deviceId?: unknown }).deviceId
          : undefined
      );

  if (!parsedEarly.ok) {
    return rejectResponse(req, logId, 400, read.byteLength, {
      ok: false,
      error: parsedEarly.error,
    });
  }

  const result = await handleTvDeviceReport(body);
  if (!result.ok) {
    if (result.status === 404) {
      return rejectResponse(req, logId, 404, read.byteLength, { ok: false });
    }
    if (result.status === 400) {
      return rejectResponse(req, logId, 400, read.byteLength, {
        ok: false,
        error: result.error ?? "error",
      });
    }
    if (result.status === 413) {
      return rejectResponse(req, logId, 413, read.byteLength, { ok: false });
    }
    if (result.status === 429) {
      logReportRequest(logId, 429, read.byteLength);
      return NextResponse.json(
        { ok: false },
        {
          status: 429,
          headers: { "Retry-After": String(result.retryAfterSec) },
        }
      );
    }
    logReportRequest(logId, result.status, read.byteLength);
    return NextResponse.json(
      { ok: false, error: result.error ?? "error" },
      { status: result.status }
    );
  }

  logReportRequest(logId, 200, read.byteLength);
  return NextResponse.json({
    ok: true,
    nextReportS: result.nextReportS,
  });
}
