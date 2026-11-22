import { NextRequest, NextResponse } from "next/server";
import { HOST_COOKIE_NAME } from "@/lib/host-auth";
import { isTestScanQuery, sanitizePropertyParam, sanitizeSlideId, sanitizeTvParam } from "@/lib/qr-track";
import { submitTvFeedback } from "@/lib/signage-analytics";

/** Guest TV feedback form (no PII). Rate-limited per TV + hour. */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    property?: string;
    tv?: string;
    slide?: string;
    rating?: number;
    comment?: string;
    website?: string;
  } | null;

  if (!body) {
    return NextResponse.json({ ok: false, reason: "invalid" }, { status: 400 });
  }

  const hasHostCookie = Boolean(req.cookies.get(HOST_COOKIE_NAME)?.value);
  const isTest = isTestScanQuery(req.nextUrl.searchParams, hasHostCookie);

  const result = await submitTvFeedback({
    propertySlug: sanitizePropertyParam(body.property),
    tvDeviceId: sanitizeTvParam(body.tv ?? null),
    slideId: sanitizeSlideId(body.slide),
    rating: Number(body.rating),
    comment: body.comment ?? null,
    honeypot: body.website ?? null,
    isTest,
  });

  if (!result.ok) {
    const status =
      result.reason === "rate_limited"
        ? 429
        : result.reason === "honeypot"
          ? 200
          : 400;
    return NextResponse.json(
      { ok: false, reason: result.reason },
      { status }
    );
  }

  return NextResponse.json({ ok: true });
}