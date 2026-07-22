/**
 * Vercel Blob credentials. The FH store ("media-haven-screensaver-1") was
 * connected to the project with the custom env prefix DUNES, so Vercel
 * injected DUNES_READ_WRITE_TOKEN — while the @vercel/blob SDK defaults to
 * BLOB_READ_WRITE_TOKEN. Every blob call must pass this token explicitly;
 * checking only the default name left uploads/listing silently dead
 * (discovered 2026-07-22 during the drone-background swap).
 */
export function blobToken(): string | undefined {
  return (
    process.env.BLOB_READ_WRITE_TOKEN ||
    process.env.DUNES_READ_WRITE_TOKEN ||
    undefined
  );
}
