export interface ScreensaverAsset {
  url: string;
  type: "image" | "video";
  tooLargeForTv?: boolean;
  /** Known size from Blob/Storage listing — used for TV preload byte cap. */
  bytes?: number;
  /** Original filename when listing provides it (host UI). */
  name?: string;
  /** Google Drive file id for admin links. */
  driveFileId?: string;
  /** Blob uploadedAt or storage created_at when known. */
  addedAt?: string;
}

export type ListScreensaversOptions = {
  includeOversized?: boolean;
  bypassBlobCache?: boolean;
};
