export interface ScreensaverAsset {
  url: string;
  type: "image" | "video";
  tooLargeForTv?: boolean;
  /** Known size from Blob/Storage listing — used for TV preload byte cap. */
  bytes?: number;
}

export type ListScreensaversOptions = {
  includeOversized?: boolean;
  bypassBlobCache?: boolean;
};
