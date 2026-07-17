/**
 * TV streaming apps sign in via activation codes: the TV app shows a short
 * code, the guest enters it at the service's activate page on their phone.
 * That page-plus-code flow is the ONLY sanctioned path into a TV app from
 * outside — there is no API to log a TV's Netflix in programmatically. So
 * the portal's job is getting the guest to the right activate page in one
 * tap, with their own account; the TV's job is showing which services are
 * one Home-press away.
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
}

export const STREAMING_SERVICES: StreamingService[] = [
  { slug: "netflix", name: "Netflix", activateUrl: "https://netflix.com/tv8", activateLabel: "netflix.com/tv8", color: "#E50914" },
  { slug: "disney", name: "Disney+", activateUrl: "https://disneyplus.com/begin", activateLabel: "disneyplus.com/begin", color: "#4FC3F7" },
  { slug: "hulu", name: "Hulu", activateUrl: "https://hulu.com/activate", activateLabel: "hulu.com/activate", color: "#1CE783" },
  { slug: "max", name: "Max", activateUrl: "https://max.com/signin", activateLabel: "max.com/signin", color: "#8A5CF6" },
  { slug: "prime", name: "Prime Video", activateUrl: "https://amazon.com/mytv", activateLabel: "amazon.com/mytv", color: "#00A8E1" },
  { slug: "paramount", name: "Paramount+", activateUrl: "https://paramountplus.com/activate", activateLabel: "paramountplus.com/activate", color: "#2D8EFF" },
  { slug: "peacock", name: "Peacock", activateUrl: "https://peacocktv.com/tv", activateLabel: "peacocktv.com/tv", color: "#FDB913" },
  { slug: "youtube", name: "YouTube", activateUrl: "https://youtube.com/activate", activateLabel: "youtube.com/activate", color: "#FF0000" },
  { slug: "appletv", name: "Apple TV+", activateUrl: "https://activate.apple.com", activateLabel: "activate.apple.com", color: "#A2AAAD" },
];

/** Services enabled for a property's settings.streaming map (absent = all). */
export function enabledServices(
  streaming: Record<string, boolean> | null | undefined
): StreamingService[] {
  const s = streaming ?? {};
  return STREAMING_SERVICES.filter((svc) => s[svc.slug] !== false);
}
