import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextRequest, NextResponse } from "next/server";
import { blobToken } from "@/lib/blob-token";
import { isHostAuthenticated } from "@/lib/host-auth";
import {
  isVideoMedia,
  maxUploadBytesForPath,
  maxUploadBytesForUpload,
  uploadSizeRejection,
} from "@/lib/media-upload-limits";
import { invalidateBlobScreensaverCache } from "@/lib/screensavers";

/**
 * Client-upload token broker for host media. The browser uploads straight to
 * Vercel Blob (no 4.5 MB server limit — 4K screensaver videos are far
 * bigger), but only after this route hands it a token, which only happens
 * for an authenticated host session.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = (await req.json()) as HandleUploadBody;

  try {
    const result = await handleUpload({
      body,
      request: req,
      token: blobToken(),
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        if (!(await isHostAuthenticated())) {
          throw new Error("host authentication required");
        }
        if (!pathname.startsWith("screensavers/")) {
          throw new Error("uploads must live under screensavers/");
        }
        let size: number | undefined;
        let contentType: string | undefined;
        try {
          const parsed = clientPayload
            ? (JSON.parse(clientPayload) as {
                size?: number;
                type?: string;
              })
            : null;
          size = parsed?.size;
          contentType = parsed?.type;
        } catch {
          /* optional client payload */
        }
        const name = pathname.split("/").pop() ?? pathname;
        const video = isVideoMedia(contentType ?? "", name);
        if (video && (size == null || !contentType)) {
          throw new Error(
            "video uploads must declare size and content type in client payload"
          );
        }
        if (size != null && contentType) {
          const reject = uploadSizeRejection(name, contentType, size);
          if (reject) {
            console.log("[media-upload]", {
              route: "api/media/upload",
              name,
              size,
              type: contentType,
              result: "rejected",
              reason: reject,
            });
            throw new Error(reject);
          }
        } else if (
          size == null ||
          !Number.isFinite(size) ||
          size <= 0
        ) {
          throw new Error("upload must declare file size in client payload");
        }
        console.log("[media-upload]", {
          route: "api/media/upload",
          name,
          size: size ?? null,
          type: contentType ?? null,
          result: "token_issued",
        });
        const maxBytes =
          contentType != null && contentType.length > 0
            ? maxUploadBytesForUpload(name, contentType)
            : maxUploadBytesForPath(pathname);
        return {
          allowedContentTypes: [
            "video/mp4",
            "video/webm",
            "video/quicktime",
            "image/jpeg",
            "image/png",
            "image/webp",
            "image/avif",
          ],
          maximumSizeInBytes: maxBytes,
          addRandomSuffix: false,
        };
      },
      onUploadCompleted: async ({ blob }) => {
        invalidateBlobScreensaverCache();
        console.log("[media-upload]", {
          route: "api/media/upload",
          name: blob.pathname,
          size: "size" in blob ? (blob as { size?: number }).size ?? null : null,
          type: blob.contentType ?? null,
          result: "completed",
        });
      },
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "upload failed";
    console.log("[media-upload]", {
      route: "api/media/upload",
      result: "error",
      message,
    });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
