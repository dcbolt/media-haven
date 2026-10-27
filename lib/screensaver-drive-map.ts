import type { ScreensaverAsset } from "./screensavers-types.ts";

/** Drive listing → asset (images only — videos stay out of TV rotation, #113). */
export function driveFileToScreensaverAsset(file: {
  id: string;
  name: string;
  mimeType: string;
}): ScreensaverAsset | null {
  if (file.mimeType.startsWith("image/")) {
    return {
      url: `https://lh3.googleusercontent.com/d/${file.id}=w3840`,
      type: "image",
      name: file.name,
      driveFileId: file.id,
    };
  }
  return null;
}
