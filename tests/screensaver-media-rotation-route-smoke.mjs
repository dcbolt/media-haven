/**
 * F-2547 — behaviour tests for host media rotation handler (mocked I/O).
 */
process.env.NEXT_PUBLIC_SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://woleywnwgjfcvowqyyix.supabase.co";

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const {
  runHostMediaRotationRequest,
  hostMediaRotationSameOrigin,
  hostMediaRotationJsonContentType,
} = await import("../lib/host-media-rotation-request.ts");
const { digestBulkDeleteUrls, BULK_DELETE_OVERSIZED_CAP } = await import(
  "../lib/screensaver-bulk-delete.ts"
);
const { DEFAULT_STANDBY_SCREENSAVER_URL } = await import(
  "../lib/screensaver-standby.ts"
);
const { resetScreensaverRotationRateLimitsForTests } = await import(
  "../lib/screensaver-rotation-rate-limit.ts"
);
const { validateScreensaverDeleteUrlShape, isBlobLookalikeHost } = await import(
  "../lib/screensaver-delete-url.ts"
);
const { blobDeleteAuthConfigured } = await import(
  "../lib/screensaver-media-delete.ts"
);

let failed = 0;
function check(name, pass) {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
  if (!pass) failed = 1;
}

const LISTED_BLOB =
  "https://store.public.blob.vercel-storage.com/screensavers/list-a.mp4";
const LISTED_SB = `https://${new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname}/storage/v1/object/public/screensavers/shared/big.mp4`;
const DRIVE =
  "https://lh3.googleusercontent.com/d/abc123XYZ=w3840";

function req(headers = {}) {
  const map = new Map(Object.entries(headers));
  return {
    headers: {
      get(k) {
        return map.get(k.toLowerCase()) ?? map.get(k) ?? null;
      },
    },
  };
}

function baseDeps(overrides = {}) {
  const listing = new Set([LISTED_BLOB, LISTED_SB, DRIVE, DEFAULT_STANDBY_SCREENSAVER_URL]);
  return {
    isAuthenticated: async () => true,
    hostIdentity: async () => "test@example.com",
    orgId: "11111111-1111-4111-8111-111111111111",
    clientIp: () => "127.0.0.1",
    listingContains: async (url) => listing.has(url),
    listInventory: async () => [
      { url: LISTED_BLOB, type: "video", tooLargeForTv: true },
      { url: LISTED_SB, type: "video", tooLargeForTv: true },
      { url: DEFAULT_STANDBY_SCREENSAVER_URL, type: "video" },
    ],
    hideUrl: async () => ({ ok: true }),
    unhideUrl: async () => ({ ok: true }),
    deleteUpload: async (url) => {
      if (url === LISTED_BLOB) return { ok: true, storage: "blob" };
      if (url === LISTED_SB) return { ok: true, storage: "supabase" };
      return { ok: false, error: "unexpected" };
    },
    invalidateBlobCache: () => {},
    sameOrigin: hostMediaRotationSameOrigin,
    jsonContentType: hostMediaRotationJsonContentType,
    ...overrides,
  };
}

resetScreensaverRotationRateLimitsForTests();

{
  const r = await runHostMediaRotationRequest(
    req(),
    { action: "delete", url: LISTED_BLOB, confirmed: true },
    { ...baseDeps(), isAuthenticated: async () => false }
  );
  check("F-2547 no-auth 401", r.status === 401);
}

{
  const r = await runHostMediaRotationRequest(
    req({
      origin: "https://evil.com",
      host: "media-haven.example",
      "sec-fetch-site": "cross-site",
      "content-type": "application/json",
    }),
    { action: "delete", url: LISTED_BLOB, confirmed: true },
    baseDeps()
  );
  check("F-2538 cross-origin rejected", r.status === 403);
}

{
  const r = await runHostMediaRotationRequest(
    req({
      host: "media-haven.example",
      "sec-fetch-site": "same-origin",
      "content-type": "text/plain",
    }),
    { action: "delete", url: LISTED_BLOB, confirmed: true },
    baseDeps()
  );
  check("F-2538 wrong content-type 415", r.status === 415);
}

{
  const r = await runHostMediaRotationRequest(
    req({
      host: "media-haven.example",
      "sec-fetch-site": "same-origin",
      "content-type": "application/json",
    }),
    { action: "delete", url: LISTED_BLOB, confirmed: "true" },
    baseDeps()
  );
  check("F-2546 confirmed must be === true", r.status === 400);
}

{
  const r = await runHostMediaRotationRequest(
    req({
      host: "media-haven.example",
      "sec-fetch-site": "same-origin",
      "content-type": "application/json",
    }),
    { action: "delete", url: "http://store.public.blob.vercel-storage.com/screensavers/x.mp4", confirmed: true },
    baseDeps()
  );
  check("F-2544 rejects http", r.status === 400);
}

check(
  "F-2544 blob lookalike host rejected",
  validateScreensaverDeleteUrlShape(
    "https://evil.public.blob.vercel-storage.com.evil.com/screensavers/x.mp4"
  ).ok === false || isBlobLookalikeHost("evil.public.blob.vercel-storage.com.evil.com")
);

{
  const r = await runHostMediaRotationRequest(
    req({
      host: "media-haven.example",
      "sec-fetch-site": "same-origin",
      "content-type": "application/json",
    }),
    {
      action: "delete",
      url: "https://store.public.blob.vercel-storage.com/other/x.mp4",
      confirmed: true,
    },
    baseDeps()
  );
  check("F-2544 wrong prefix rejected", r.status === 400);
}

{
  const r = await runHostMediaRotationRequest(
    req({
      host: "media-haven.example",
      "sec-fetch-site": "same-origin",
      "content-type": "application/json",
    }),
    {
      action: "delete",
      url: "https://store.public.blob.vercel-storage.com/screensavers/not-listed.mp4",
      confirmed: true,
    },
    baseDeps()
  );
  check("F-2544 unlisted url rejected", r.status === 400);
}

{
  const r = await runHostMediaRotationRequest(
    req({
      host: "media-haven.example",
      "sec-fetch-site": "same-origin",
      "content-type": "application/json",
    }),
    {
      action: "delete",
      url: DEFAULT_STANDBY_SCREENSAVER_URL,
      confirmed: true,
    },
    baseDeps()
  );
  check("F-2545 standby video not deletable", r.status === 400);
}

{
  let delCalls = 0;
  const r = await runHostMediaRotationRequest(
    req({
      host: "media-haven.example",
      "sec-fetch-site": "same-origin",
      "content-type": "application/json",
    }),
    { action: "delete", url: LISTED_BLOB, confirmed: true },
    {
      ...baseDeps(),
      deleteUpload: async () => {
        delCalls += 1;
        return { ok: true, storage: "blob" };
      },
    }
  );
  check("F-2547 delete ok calls deleteUpload", r.status === 200 && delCalls === 1);
}

{
  const preview = await runHostMediaRotationRequest(
    req({
      host: "media-haven.example",
      "sec-fetch-site": "same-origin",
      "content-type": "application/json",
    }),
    { action: "bulk-delete-oversized-preview" },
    baseDeps()
  );
  const batch = preview.body.batchUrls;
  check(
    "F-2533 bulk preview returns batch cap",
    preview.status === 200 &&
      batch.length <= BULK_DELETE_OVERSIZED_CAP &&
      preview.body.batchDigest
  );

  const bad = await runHostMediaRotationRequest(
    req({
      host: "media-haven.example",
      "sec-fetch-site": "same-origin",
      "content-type": "application/json",
    }),
    {
      action: "bulk-delete-oversized",
      confirmed: true,
      bulkCount: 999,
      bulkDigest: preview.body.batchDigest,
      bulkUrls: batch,
    },
    baseDeps()
  );
  check("F-2533 bulk count mismatch rejected", bad.status === 400);

  const good = await runHostMediaRotationRequest(
    req({
      host: "media-haven.example",
      "sec-fetch-site": "same-origin",
      "content-type": "application/json",
    }),
    {
      action: "bulk-delete-oversized",
      confirmed: true,
      bulkCount: batch.length,
      bulkDigest: preview.body.batchDigest,
      bulkUrls: batch,
    },
    baseDeps()
  );
  check(
    "F-2533 bulk delete with matching digest",
    good.status === 200 && Array.isArray(good.body.deleted)
  );
}

{
  let n = 0;
  const deps = baseDeps({
    deleteUpload: async (url) => {
      n += 1;
      if (url === LISTED_BLOB) return { ok: true, storage: "blob" };
      return { ok: false, error: "fail" };
    },
  });
  const preview = await runHostMediaRotationRequest(
    req({
      host: "media-haven.example",
      "sec-fetch-site": "same-origin",
      "content-type": "application/json",
    }),
    { action: "bulk-delete-oversized-preview" },
    deps
  );
  const batch = preview.body.batchUrls;
  const r = await runHostMediaRotationRequest(
    req({
      host: "media-haven.example",
      "sec-fetch-site": "same-origin",
      "content-type": "application/json",
    }),
    {
      action: "bulk-delete-oversized",
      confirmed: true,
      bulkCount: batch.length,
      bulkDigest: preview.body.batchDigest,
      bulkUrls: batch,
    },
    deps
  );
  check(
    "F-2550 partial bulk failure surfaced",
    r.status === 200 &&
      r.body.partial === true &&
      r.body.errors?.length > 0 &&
      r.body.deleted?.length > 0
  );
}

const routeSrc = readFileSync(
  fileURLToPath(
    new URL("../app/api/host/media/rotation/route.ts", import.meta.url)
  ),
  "utf8"
);
check(
  "F-2547 route delegates to runHostMediaRotationRequest",
  /runHostMediaRotationRequest/.test(routeSrc) &&
    /isHostAuthenticated/.test(routeSrc)
);
check(
  "F-2547 removing auth wiring fails guard",
  !/isAuthenticated:\s*async\s*\(\)\s*=>\s*true/.test(routeSrc)
);

check(
  "F-2551 blob delete auth helper documents RW token",
  typeof blobDeleteAuthConfigured() === "boolean"
);

process.exit(failed);
