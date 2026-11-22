import { NextRequest, NextResponse } from "next/server";
import { HOST_COOKIE_NAME } from "@/lib/host-auth";
import { isTestScanQuery, sanitizePropertyParam, sanitizeTvParam } from "@/lib/qr-track";
import { recordImpressionBatch } from "@/lib/signage-analytics";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Low-frequency batched slide impression beacons from paired TVs. */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    deviceId?: string;
    propertySlug?: string;
    isTest?: boolean;
    rows?: { slideId?: string; showCount?: number; secondsOnScreen?: number }[];
  } | null;

  if (!body?.deviceId || !UUID_RE.test(body.deviceId)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const hasHostCookie = Boolean(req.cookies.get(HOST_COOKIE_NAME)?.value);
  const isTest =
    body.isTest === true ||
    isTestScanQuery(req.nextUrl.searchParams, hasHostCookie);

  void recordImpressionBatch({
    propertySlug: sanitizePropertyParam(body.propertySlug),
    tvDeviceId: sanitizeTvParam(body.deviceId),
    isTest,
    rows: (body.rows ?? []).map((r) => ({
      slideId: r.slideId ?? "unknown",
      showCount: Number(r.showCount) || 0,
      secondsOnScreen: Number(r.secondsOnScreen) || 0,
    })),
  }).catch(() => {
    /* fail-silent */
  });

  return NextResponse.json({ ok: true });
}