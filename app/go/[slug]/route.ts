import { NextRequest, NextResponse } from "next/server";
import { HOST_COOKIE_NAME } from "@/lib/host-auth";
import {
  appendQrUtm,
  coarseUaClass,
  isTestScanQuery,
  recordScan,
  recordScanEvent,
  resolveScanDest,
  sanitizePropertyParam,
  sanitizeSlideId,
  sanitizeTvParam,
  type ScanSlug,
} from "@/lib/qr-track";

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
 * mid-scan. Destinations come from the server slug map or an allowlisted `to`;
 * bogus slugs land on the brand site. Logging is fail-open.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const propertySlug = sanitizePropertyParam(
    req.nextUrl.searchParams.get("property")
  );
  const tvDeviceId = sanitizeTvParam(req.nextUrl.searchParams.get("tv"));
  const slideId = sanitizeSlideId(req.nextUrl.searchParams.get("slide"));
  const dest = resolveScanDest(slug, req.nextUrl.searchParams.get("to"), {
    property: propertySlug,
    tv: tvDeviceId ?? undefined,
    slide: slideId ?? undefined,
  });
  const fallback = NextResponse.redirect("https://www.thefloridahavens.com", 302);

  if (!dest) {
    return fallback;
  }

  const hasHostCookie = Boolean(req.cookies.get(HOST_COOKIE_NAME)?.value);
  const isTest = isTestScanQuery(req.nextUrl.searchParams, hasHostCookie);
  const uaClass = coarseUaClass(req.headers.get("user-agent"));
  const outbound = appendQrUtm(
    dest,
    slug,
    propertySlug,
    tvDeviceId,
    slideId
  );

  if (isScanSlug(slug)) {
    void Promise.all([
      recordScan(slug),
      recordScanEvent({
        slug,
        propertySlug,
        tvDeviceId,
        slideId,
        uaClass,
        isTest,
      }),
    ]).catch(() => {
      /* fail-open */
    });
  }

  return NextResponse.redirect(outbound, 302);
}