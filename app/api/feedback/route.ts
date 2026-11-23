import { NextRequest, NextResponse } from "next/server";
import { sanitizeAttributionTag, sanitizePropertyParam, sanitizeSlideId } from "@/lib/qr-track";
import { submitTvFeedback } from "@/lib/signage-analytics";
import { isServerTestTraffic } from "@/lib/server-test-mode";
import { resolvePairedTvByTag } from "@/lib/tv-attribution-resolve";

/** Guest TV feedback form (no PII). Rate-limited server-side. */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    property?: string;
    tag?: string;
    slide?: string;
    rating?: number;
    comment?: string;
    website?: string;
  } | null;

  if (!body) {
    return NextResponse.json({ ok: false, reason: "invalid" }, { status: 400 });
  }

  const isTest = await isServerTestTraffic();
  const tag = sanitizeAttributionTag(body.tag ?? null);
  const paired = tag ? await resolvePairedTvByTag(tag) : null;

  const result = await submitTvFeedback({
    propertySlug: sanitizePropertyParam(body.property),
    tvDeviceId: paired?.deviceId ?? null,
    slideId: sanitizeSlideId(body.slide),
    rating: Number(body.rating),
    comment: body.comment ?? null,
    honeypot: body.website ?? null,
    isTest,
    orgId: paired?.orgId ?? undefined,
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