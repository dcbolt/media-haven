import { createHash } from "crypto";
import { classifyScreensaverDeleteStorage } from "./screensaver-delete-url.ts";
import type { ScreensaverAsset } from "./screensavers-types.ts";

export const BULK_DELETE_OVERSIZED_CAP = 25;

export type BulkOversizedPreview = {
  count: number;
  urls: string[];
  digest: string;
  blobCount: number;
  supabaseCount: number;
};

export function digestBulkDeleteUrls(urls: string[]): string {
  const sorted = [...urls].sort();
  return createHash("sha256").update(sorted.join("\n"), "utf8").digest("hex");
}

export function buildBulkOversizedPreview(
  assets: ScreensaverAsset[],
  isDeletableListed: (url: string) => boolean
): BulkOversizedPreview {
  const urls = assets
    .filter((a) => a.tooLargeForTv && isDeletableListed(a.url))
    .map((a) => a.url);
  let blobCount = 0;
  let supabaseCount = 0;
  for (const u of urls) {
    const kind = classifyScreensaverDeleteStorage(u);
    if (kind === "blob") blobCount += 1;
    else if (kind === "supabase") supabaseCount += 1;
  }
  return {
    count: urls.length,
    urls,
    digest: digestBulkDeleteUrls(urls),
    blobCount,
    supabaseCount,
  };
}

export function bulkDeleteBatchUrls(allUrls: string[]): string[] {
  return allUrls.slice(0, BULK_DELETE_OVERSIZED_CAP);
}

export function bulkDeleteWording(preview: BulkOversizedPreview): string {
  const parts: string[] = [];
  if (preview.blobCount > 0) {
    parts.push(
      `${preview.blobCount} Vercel Blob upload${preview.blobCount === 1 ? "" : "s"}`
    );
  }
  if (preview.supabaseCount > 0) {
    parts.push(
      `${preview.supabaseCount} Supabase file${preview.supabaseCount === 1 ? "" : "s"}`
    );
  }
  if (parts.length === 0) return "0 stored files";
  return parts.join(" and ");
}
