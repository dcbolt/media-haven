import { NextRequest, NextResponse } from "next/server";
import { HOST_COOKIE_NAME } from "@/lib/host-auth";
import { sanitizePropertyParam, sanitizeAttributionTag } from "@/lib/qr-track";
import { recordImpressionBatch } from "@/lib/signage-analytics";
import {
  impressionGuards,
  resolveImpressionDevice,
} from "@/lib/signage-guards";
import { isHostTestSession } from "@/lib/server-test-mode";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const requestHits = new Map<string, { count: number; reset: number }>();
const ROUTE_BURST_PER_MIN = 24;

function routeRateLimited(key: string): boolean {
  const now = Date.now();
  const hit = requestHits.get(key);
  if (!hit || hit.reset < now) {
    requestHits.set(key, { count: 1, reset: now + 60_000 });
    return false;
  }
  hit.count += 1;
  return hit.count > ROUTE_BURST_PER_MIN;
}

/** Low-frequency batched slide impression beacons from paired TVs. */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    deviceId?: string;
    attributionTag?: string;
    propertySlug?: string;
    rows?: { slideId?: string; showCount?: number; secondsOnScreen?: number }[];
  } | null;

  const deviceId =
    body?.deviceId && UUID_RE.test(body.deviceId) ? body.deviceId : undefined;
  const attributionTag = sanitizeAttributionTag(body?.attributionTag);
  if (!deviceId && !attributionTag) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const paired = await resolveImpressionDevice({
    deviceId,
    attributionTag: attributionTag ?? undefined,
  });
  if (!paired) {
    return NextResponse.json({ ok: false, reason: "unknown_device" }, { status: 403 });
  }

  const rateKey = paired.deviceId;
  if (routeRateLimited(rateKey)) {
    return NextResponse.json({ ok: false, reason: "rate_limited" }, { status: 429 });
  }

  const rows = (body?.rows ?? []).map((r) => ({
    slideId: r.slideId ?? "unknown",
    showCount: Number(r.showCount) || 0,
    secondsOnScreen: Number(r.secondsOnScreen) || 0,
  }));

  const guard = await impressionGuards(paired, rows.length);
  if (guard === "rate_limited") {
    return NextResponse.json({ ok: false, reason: "rate_limited" }, { status: 429 });
  }
  if (guard === "unknown_device") {
    return NextResponse.json({ ok: false, reason: "unknown_device" }, { status: 403 });
  }

  const hasHostCookie = Boolean(req.cookies.get(HOST_COOKIE_NAME)?.value);
  const isTest = isHostTestSession(hasHostCookie);

  void recordImpressionBatch({
    propertySlug: sanitizePropertyParam(body?.propertySlug),
    tvDeviceId: paired.deviceId,
    isTest,
    rows,
    orgId: paired.orgId ?? undefined,
  }).catch(() => {
    /* fail-silent */
  });

  return NextResponse.json({ ok: true });
}