import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextRequest, NextResponse } from "next/server";
import { blobToken } from "@/lib/blob-token";
import { isHostAuthenticated } from "@/lib/host-auth";

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
      onBeforeGenerateToken: async (pathname) => {
        if (!(await isHostAuthenticated())) {
          throw new Error("host authentication required");
        }
        if (!pathname.startsWith("screensavers/")) {
          throw new Error("uploads must live under screensavers/");
        }
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
          maximumSizeInBytes: 500 * 1024 * 1024,
          addRandomSuffix: false,
        };
      },
      onUploadCompleted: async () => {
        // Nothing to record — listScreensavers() reads the store directly.
      },
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "upload failed" },
      { status: 400 }
    );
  }
}
