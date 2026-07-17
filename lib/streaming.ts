/**
 * TV streaming apps sign in via activation codes: the TV app shows a short
 * code, the guest enters it at the service's activate page on their phone.
 * That page-plus-code flow is the ONLY sanctioned path into a TV app from
 * outside — there is no API to log a TV's Netflix in programmatically. So
 * the portal's job is getting the guest to the right activate page in one
 * tap, with their own account; the TV's job is launching the chosen app
 * directly (Android intent deep link — same device, same HDMI input, no
 * Home-button hunting) and walking the sign-in.
 *
 * Which services appear is CMS-managed per property:
 * properties.settings.streaming.<slug> === false hides a service on that
 * property's TV slide and guest portal. Everything defaults to shown.
 */
export interface StreamingService {
  slug: string;
  name: string;
  activateUrl: string;
  activateLabel: string; // what the guest types/sees, shorter than the URL
  color: string; // brand accent for the TV tile
  /** Android TV package — the kiosk fires an intent:// at it so picking a
   *  tile opens the real app in place. Wrong/missing package is harmless:
   *  the intent no-ops and the on-screen walkthrough still guides. */
  androidPackage: string;
}

export const STREAMING_SERVICES: StreamingService[] = [
  { slug: "netflix", name: "Netflix", activateUrl: "https://netflix.com/tv8", activateLabel: "netflix.com/tv8", color: "#E50914", androidPackage: "com.netflix.ninja" },
  { slug: "disney", name: "Disney+", activateUrl: "https://disneyplus.com/begin", activateLabel: "disneyplus.com/begin", color: "#4FC3F7", androidPackage: "com.disney.disneyplus" },
  { slug: "hulu", name: "Hulu", activateUrl: "https://hulu.com/activate", activateLabel: "hulu.com/activate", color: "#1CE783", androidPackage: "com.hulu.livingroomplus" },
  { slug: "max", name: "Max", activateUrl: "https://max.com/signin", activateLabel: "max.com/signin", color: "#8A5CF6", androidPackage: "com.wbd.stream" },
  { slug: "prime", name: "Prime Video", activateUrl: "https://amazon.com/mytv", activateLabel: "amazon.com/mytv", color: "#00A8E1", androidPackage: "com.amazon.amazonvideo.livingroom" },
  { slug: "paramount", name: "Paramount+", activateUrl: "https://paramountplus.com/activate", activateLabel: "paramountplus.com/activate", color: "#2D8EFF", androidPackage: "com.cbs.ott" },
  { slug: "peacock", name: "Peacock", activateUrl: "https://peacocktv.com/tv", activateLabel: "peacocktv.com/tv", color: "#FDB913", androidPackage: "com.peacocktv.peacockandroid" },
  { slug: "youtube", name: "YouTube", activateUrl: "https://youtube.com/activate", activateLabel: "youtube.com/activate", color: "#FF0000", androidPackage: "com.google.android.youtube.tv" },
  { slug: "appletv", name: "Apple TV+", activateUrl: "https://activate.apple.com", activateLabel: "activate.apple.com", color: "#A2AAAD", androidPackage: "com.apple.atve.androidtv.appletv" },
];

/** intent:// URI that launches the app's Android TV activity in place —
 *  the browser stays loaded underneath, so backing out of the app lands
 *  right back on the guide. Unknown package (or a non-Android preview
 *  browser) makes this a silent no-op. */
export function appLaunchUrl(androidPackage: string): string {
  return `intent:#Intent;action=android.intent.action.MAIN;category=android.intent.category.LEANBACK_LAUNCHER;package=${androidPackage};end`;
}

/** Services enabled for a property's settings.streaming map (absent = all). */
export function enabledServices(
  streaming: Record<string, boolean> | null | undefined
): StreamingService[] {
  const s = streaming ?? {};
  return STREAMING_SERVICES.filter((svc) => s[svc.slug] !== false);
}
