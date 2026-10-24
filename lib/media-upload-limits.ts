/**
 * Host media upload size limits (TV-safe video budget).
 */

export const MAX_TV_VIDEO_BYTES = 150 * 1024 * 1024;
export const MAX_IMAGE_UPLOAD_BYTES = 500 * 1024 * 1024;

const VIDEO_EXT = /\.(mp4|webm|mov)$/i;

export function isVideoUploadName(name: string): boolean {
  return VIDEO_EXT.test(name);
}

/** null = ok; string = rejection message for host UI */
export function uploadSizeRejection(
  name: string,
  mimeType: string,
  size: number
): string | null {
  if (!Number.isFinite(size) || size <= 0) return "invalid file size";
  const video =
    mimeType.startsWith("video/") || isVideoUploadName(name);
  if (video && size > MAX_TV_VIDEO_BYTES) {
    return `video too large for TVs (max ${Math.floor(MAX_TV_VIDEO_BYTES / (1024 * 1024))} MB — use a lower-bitrate encode)`;
  }
  const max = video ? MAX_TV_VIDEO_BYTES : MAX_IMAGE_UPLOAD_BYTES;
  if (size > max) {
    return `file too large (max ${Math.floor(max / (1024 * 1024))} MB)`;
  }
  return null;
}

export function maxUploadBytesForPath(pathname: string): number {
  return isVideoUploadName(pathname) ? MAX_TV_VIDEO_BYTES : MAX_IMAGE_UPLOAD_BYTES;
}
