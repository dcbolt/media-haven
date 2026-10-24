export interface ScreensaverAsset {
  url: string;
  type: "image" | "video";
  tooLargeForTv?: boolean;
}

export type ListScreensaversOptions = {
  includeOversized?: boolean;
  bypassBlobCache?: boolean;
};
