import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { HOST_COOKIE_NAME } from "@/lib/host-auth";
import {
  appendQrUtm,
  coarseUaClass,
  isDuplicateScanWithinWindow,
  isScanBotUserAgent,
  QR_VISITOR_COOKIE,
  recordScan,
  recordScanEvent,
  resolveScanDest,
  sanitizeAttributionTag,
  sanitizePropertyParam,
  sanitizeSlideId,
  type ScanSlug,
} from "@/lib/qr-track";
import { isHostTestSession } from "@/lib/server-test-mode";
import { resolvePairedTvByTag } from "@/lib/tv-attribution-resolve";

const SLUG_SET = new Set([
  "book",
  "rebook",
  "extend",
  "story",
  "guestbook",
  "review",
  "portal",
  "upsell",
  "feedback",
]);

function isScanSlug(slug: string): slug is ScanSlug {
  return SLUG_SET.has(slug);
}

/**
 * QR scan tracker: counts the scan (with attribution when present), then 302s
 * to the real destination with UTM tags. Public on purpose — guests hit this
 * mid-scan. Device UUIDs never appear in outbound URLs or UTMs.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const propertySlug = sanitizePropertyParam(
    req.nextUrl.searchParams.get("property")
  );
  const attributionTag = sanitizeAttributionTag(
    req.nextUrl.searchParams.get("tag")
  );
  const slideId = sanitizeSlideId(req.nextUrl.searchParams.get("slide"));
  const dest = resolveScanDest(slug, req.nextUrl.searchParams.get("to"), {
    property: propertySlug,
    tag: attributionTag ?? undefined,
    slide: slideId ?? undefined,
  });
  const fallback = NextResponse.redirect("https://www.thefloridahavens.com", 302);

  if (!dest) {
    return fallback;
  }

  const paired = attributionTag
    ? await resolvePairedTvByTag(attributionTag)
    : null;
  const tvDeviceId = paired?.deviceId ?? null;
  const ua = req.headers.get("user-agent");
  const uaClass = coarseUaClass(ua);
  const skipAnalytics =
    isScanBotUserAgent(ua) || uaClass === "bot";
  const hasHostCookie = Boolean(req.cookies.get(HOST_COOKIE_NAME)?.value);
  const isTest = isHostTestSession(hasHostCookie);
  const outbound = appendQrUtm(
    dest,
    slug,
    propertySlug,
    attributionTag,
    slideId
  );

  let visitorKey = req.cookies.get(QR_VISITOR_COOKIE)?.value ?? null;
  if (!visitorKey || visitorKey.length > 64) {
    visitorKey = randomUUID();
  }

  const response = NextResponse.redirect(outbound, 302);
  response.cookies.set(QR_VISITOR_COOKIE, visitorKey, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });

  if (isScanSlug(slug) && !skipAnalytics) {
    const duped = await isDuplicateScanWithinWindow({
      slug,
      propertySlug,
      attributionTag,
      visitorKey,
      orgId: paired?.orgId ?? undefined,
    });
    if (!duped) {
      void Promise.all([
        recordScan(slug),
        recordScanEvent({
          slug,
          propertySlug,
          attributionTag,
          tvDeviceId,
          slideId,
          visitorKey,
          uaClass,
          isTest,
          orgId: paired?.orgId ?? undefined,
        }),
      ]).catch(() => {
        /* fail-open */
      });
    }
  }

  return response;
}