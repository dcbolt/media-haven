import { NextRequest, NextResponse } from "next/server";
import {
  appendQrUtm,
  coarseUaClass,
  isDuplicateScanWithinWindow,
  isScanBotUserAgent,
  recordScan,
  recordScanEvent,
  resolveScanDest,
  sanitizeAttributionTag,
  sanitizePropertyParam,
  sanitizeSlideId,
  type ScanSlug,
} from "@/lib/qr-track";
import {
  hashQrVisitorKey,
  isValidQrVisitorCookieToken,
  mintQrVisitorCookieToken,
  QR_VISITOR_COOKIE,
  QR_VISITOR_COOKIE_MAX_AGE_SEC,
} from "@/lib/qr-visitor-key";
import { isServerTestTraffic } from "@/lib/server-test-mode";
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
 * to the real destination with UTM tags. Device UUIDs never appear in outbound URLs or UTMs.
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
  const isTest = await isServerTestTraffic();
  const outbound = appendQrUtm(
    dest,
    slug,
    propertySlug,
    attributionTag,
    slideId
  );

  let cookieToken = req.cookies.get(QR_VISITOR_COOKIE)?.value ?? null;
  if (!isValidQrVisitorCookieToken(cookieToken)) {
    cookieToken = mintQrVisitorCookieToken();
  }
  const visitorKey = hashQrVisitorKey(cookieToken);

  const response = NextResponse.redirect(outbound, 302);
  response.cookies.set(QR_VISITOR_COOKIE, cookieToken!, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: QR_VISITOR_COOKIE_MAX_AGE_SEC,
    path: "/",
  });

  if (isScanSlug(slug) && !skipAnalytics) {
    const duped = visitorKey
      ? await isDuplicateScanWithinWindow({
          slug,
          propertySlug,
          attributionTag,
          visitorKey,
          orgId: paired?.orgId ?? undefined,
        })
      : false;
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