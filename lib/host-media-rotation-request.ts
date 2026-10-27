/**
 * Host POST /api/host/media/rotation — testable handler (F-2547).
 */

import {
  bulkDeleteBatchUrls,
  buildBulkOversizedPreview,
  BULK_DELETE_OVERSIZED_CAP,
  digestBulkDeleteUrls,
  type BulkOversizedPreview,
} from "./screensaver-bulk-delete.ts";
import {
  validateScreensaverDeleteUrlShape,
  type ScreensaverDeleteUrlRejectCode,
} from "./screensaver-delete-url.ts";
import { detectScreensaverSource } from "./screensaver-media-info.ts";
import { logScreensaverRotationAudit } from "./screensaver-rotation-audit.ts";
import {
  screensaverRotationRateLimitKey,
  screensaverRotationRateLimited,
} from "./screensaver-rotation-rate-limit.ts";

export type HostMediaRotationRequestBody = {
  action?: string;
  url?: string;
  confirmed?: unknown;
  bulkDigest?: string;
  bulkCount?: number;
  bulkUrls?: string[];
};

export type HostMediaRotationHttpRequest = {
  headers: {
    get(name: string): string | null;
  };
};

export type HostMediaRotationDeps = {
  isAuthenticated: () => Promise<boolean>;
  hostIdentity: () => Promise<string | null>;
  orgId: string;
  clientIp: (req: HostMediaRotationHttpRequest) => string | null;
  listingContains: (url: string) => Promise<boolean>;
  listInventory: () => Promise<
    import("./screensavers-types.ts").ScreensaverAsset[]
  >;
  hideUrl: (url: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  unhideUrl: (url: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  deleteUpload: (
    url: string
  ) => Promise<
    | { ok: true; storage: "blob" | "supabase" }
    | { ok: false; error: string; code?: string }
  >;
  invalidateBlobCache: () => void;
  sameOrigin: (req: HostMediaRotationHttpRequest) => boolean;
  jsonContentType: (req: HostMediaRotationHttpRequest) => boolean;
};

export type HostMediaRotationResult = {
  status: number;
  body: Record<string, unknown>;
};

function reject(code: string, status: number, extra?: Record<string, unknown>) {
  return { status, body: { error: code, ...extra } };
}

export function hostMediaRotationSameOrigin(
  req: HostMediaRotationHttpRequest
): boolean {
  const site = req.headers.get("sec-fetch-site")?.toLowerCase() ?? "";
  if (site === "cross-site") return false;
  const origin = req.headers.get("origin");
  if (!origin) {
    return site === "same-origin" || site === "same-site" || site === "none" || site === "";
  }
  try {
    const o = new URL(origin);
    if (o.protocol !== "https:" && o.protocol !== "http:") return false;
    const host =
      req.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ??
      req.headers.get("host") ??
      "";
    if (!host) return false;
    const expectedHost = host.split(":")[0]?.toLowerCase();
    return o.hostname.toLowerCase() === expectedHost;
  } catch {
    return false;
  }
}

export function hostMediaRotationJsonContentType(
  req: HostMediaRotationHttpRequest
): boolean {
  const ct = req.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  return ct === "application/json";
}

async function assertDeletableListed(
  url: string,
  deps: HostMediaRotationDeps
): Promise<HostMediaRotationResult | null> {
  const shape = validateScreensaverDeleteUrlShape(url);
  if (!shape.ok) {
    return reject(shape.code, 400);
  }
  if (!(await deps.listingContains(url))) {
    return reject("not_in_listing", 400);
  }
  return null;
}

export async function runHostMediaRotationRequest(
  req: HostMediaRotationHttpRequest,
  body: HostMediaRotationRequestBody,
  deps: HostMediaRotationDeps
): Promise<HostMediaRotationResult> {
  if (!(await deps.isAuthenticated())) {
    return reject("unauthorized", 401);
  }

  if (!deps.sameOrigin(req)) {
    return reject("cross_origin", 403);
  }
  if (!deps.jsonContentType(req)) {
    return reject("content_type", 415);
  }

  const ipKey = screensaverRotationRateLimitKey(deps.clientIp(req));
  if (screensaverRotationRateLimited(ipKey)) {
    return reject("rate_limited", 429);
  }

  const identity = await deps.hostIdentity();
  const action = body.action ?? "";

  const logWithIdentity = (
    act: Parameters<typeof logScreensaverRotationAudit>[0]["action"],
    fields: { url?: string; urls?: string[]; source?: string }
  ) => {
    logScreensaverRotationAudit({
      action: act,
      orgId: deps.orgId,
      hostIdentity: identity,
      ip: deps.clientIp(req),
      userAgent: req.headers.get("user-agent"),
      ...fields,
    });
  };

  if (action === "bulk-delete-oversized-preview") {
    const inventory = await deps.listInventory();
    const preview = buildBulkOversizedPreview(inventory, (url) => {
      const shape = validateScreensaverDeleteUrlShape(url);
      return shape.ok;
    });
    const batch = bulkDeleteBatchUrls(preview.urls);
    return {
      status: 200,
      body: {
        ok: true,
        action,
        count: preview.count,
        batchCount: batch.length,
        cap: BULK_DELETE_OVERSIZED_CAP,
        urls: preview.urls,
        batchUrls: batch,
        digest: preview.digest,
        batchDigest: digestBulkDeleteUrls(batch),
        blobCount: preview.blobCount,
        supabaseCount: preview.supabaseCount,
      },
    };
  }

  if (body.confirmed !== true) {
    return reject("confirmation required", 400);
  }

  if (action === "hide") {
    const url = body.url ?? "";
    if (!url) return reject("url required", 400);
    if (detectScreensaverSource(url) !== "google_drive") {
      return reject("only_google_drive", 400);
    }
    const result = await deps.hideUrl(url);
    if (!result.ok) return reject(result.error, 400);
    logWithIdentity("hide", { url, source: "google_drive" });
    return { status: 200, body: { ok: true, action, url } };
  }

  if (action === "unhide") {
    const url = body.url ?? "";
    if (!url) return reject("url required", 400);
    const result = await deps.unhideUrl(url);
    if (!result.ok) return reject(result.error, 400);
    logWithIdentity("unhide", { url, source: "google_drive" });
    return { status: 200, body: { ok: true, action, url } };
  }

  if (action === "delete") {
    const url = body.url ?? "";
    if (!url) return reject("url required", 400);
    const blocked = await assertDeletableListed(url, deps);
    if (blocked) return blocked;
    const source = detectScreensaverSource(url);
    const result = await deps.deleteUpload(url);
    if (!result.ok) {
      return {
        status: result.code === "not_deletable" ? 400 : 502,
        body: { error: result.error, code: result.code },
      };
    }
    deps.invalidateBlobCache();
    logWithIdentity("delete", { url, source });
    return { status: 200, body: { ok: true, action, url } };
  }

  if (action === "bulk-delete-oversized") {
    const inventory = await deps.listInventory();
    const preview = buildBulkOversizedPreview(inventory, (url) => {
      const shape = validateScreensaverDeleteUrlShape(url);
      return shape.ok;
    });
    const batch = bulkDeleteBatchUrls(preview.urls);
    const batchDigest = digestBulkDeleteUrls(batch);

    if (typeof body.bulkCount !== "number" || body.bulkCount !== batch.length) {
      return reject("bulk_count_mismatch", 400, {
        expected: batch.length,
        previewCount: preview.count,
      });
    }
    if (body.bulkDigest !== batchDigest) {
      return reject("bulk_digest_mismatch", 400);
    }
    const reqUrls = Array.isArray(body.bulkUrls) ? body.bulkUrls : [];
    if (
      reqUrls.length !== batch.length ||
      digestBulkDeleteUrls([...reqUrls].sort()) !== batchDigest
    ) {
      return reject("bulk_urls_mismatch", 400);
    }

    const deleted: string[] = [];
    const errors: { url: string; error: string }[] = [];
    for (const url of batch) {
      const blocked = await assertDeletableListed(url, deps);
      if (blocked) {
        errors.push({ url, error: String(blocked.body.error) });
        continue;
      }
      const result = await deps.deleteUpload(url);
      if (result.ok) deleted.push(url);
      else errors.push({ url, error: result.error });
    }
    if (deleted.length > 0) deps.invalidateBlobCache();
    logWithIdentity("bulk-delete-oversized", { urls: batch, source: "mixed" });
    return {
      status: 200,
      body: {
        ok: errors.length === 0,
        action,
        deleted,
        errors,
        partial: errors.length > 0 && deleted.length > 0,
      },
    };
  }

  return reject("unknown action", 400);
}

export type { BulkOversizedPreview, ScreensaverDeleteUrlRejectCode };
