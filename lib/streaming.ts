/**
 * TV streaming apps sign in via activation codes: the TV app shows a short
 * code, the guest enters it at the service's activate page on their phone.
 * That page-plus-code flow is the ONLY sanctioned path into a TV app from
 * outside — there is no API to log a TV's Netflix in programmatically. So
 * the portal's job is getting the guest to the right activate page in one
 * tap, with their own account.
 */
export interface StreamingService {
  name: string;
  activateUrl: string;
  activateLabel: string; // what the guest types/sees, shorter than the URL
}

export const STREAMING_SERVICES: StreamingService[] = [
  { name: "Netflix", activateUrl: "https://netflix.com/tv8", activateLabel: "netflix.com/tv8" },
  { name: "Disney+", activateUrl: "https://disneyplus.com/begin", activateLabel: "disneyplus.com/begin" },
  { name: "Hulu", activateUrl: "https://hulu.com/activate", activateLabel: "hulu.com/activate" },
  { name: "Max", activateUrl: "https://max.com/signin", activateLabel: "max.com/signin" },
  { name: "Prime Video", activateUrl: "https://amazon.com/mytv", activateLabel: "amazon.com/mytv" },
  { name: "Paramount+", activateUrl: "https://paramountplus.com/activate", activateLabel: "paramountplus.com/activate" },
  { name: "Peacock", activateUrl: "https://peacocktv.com/tv", activateLabel: "peacocktv.com/tv" },
  { name: "YouTube", activateUrl: "https://youtube.com/activate", activateLabel: "youtube.com/activate" },
];
