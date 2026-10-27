import { NextRequest, NextResponse } from "next/server";
import { hostIdentity, isHostAuthenticated } from "@/lib/host-auth";
import { deleteScreensaverUpload } from "@/lib/screensaver-media-delete";
import {
  hostMediaRotationJsonContentType,
  hostMediaRotationSameOrigin,
  runHostMediaRotationRequest,
} from "@/lib/host-media-rotation-request";
import { getFloridaHavensOrgId } from "@/lib/org";
import {
  hideScreensaverUrl,
  unhideScreensaverUrl,
} from "@/lib/screensaver-hidden";
import {
  invalidateBlobScreensaverCache,
  listScreensaversIncludingOversized,
  screensaverListingContainsUrl,
} from "@/lib/screensavers";

function clientIp(req: NextRequest): string | null {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const result = await runHostMediaRotationRequest(req, body, {
    isAuthenticated: isHostAuthenticated,
    hostIdentity,
    orgId: getFloridaHavensOrgId(),
    clientIp: (r) => clientIp(r as NextRequest),
    listingContains: (url) => screensaverListingContainsUrl(url, null),
    listInventory: () => listScreensaversIncludingOversized(null, true),
    hideUrl: async (url) => {
      if (!(await screensaverListingContainsUrl(url, null))) {
        return { ok: false as const, error: "not_in_listing" };
      }
      return hideScreensaverUrl(url, getFloridaHavensOrgId());
    },
    unhideUrl: (url) => unhideScreensaverUrl(url, getFloridaHavensOrgId()),
    deleteUpload: deleteScreensaverUpload,
    invalidateBlobCache: invalidateBlobScreensaverCache,
    sameOrigin: hostMediaRotationSameOrigin,
    jsonContentType: hostMediaRotationJsonContentType,
  });
  return NextResponse.json(result.body, { status: result.status });
}
