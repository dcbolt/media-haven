import { PROPERTY_BRAND_SLUGS, propertySlugForName } from "./logos.ts";

/**
 * Pure QR attribution + redirect helpers (no Supabase). Imported by qr-track.ts
 * and Node smoke fixtures without pulling the full server graph.
 */

export const SCAN_SLUGS = [
  "book",
  "rebook",
  "extend",
  "story",
  "guestbook",
  "review",
  "portal",
  "upsell",
  "feedback",
] as const;
export type ScanSlug = (typeof SCAN_SLUGS)[number];

export const SLUG_LABELS: Record<ScanSlug, string> = {
  book: "Book direct",
  rebook: "Next-year rebook",
  extend: "Extend stay",
  story: "Guest book (digital)",
  guestbook: "Guest book",
  review: "Google review",
  portal: "Guest portal",
  upsell: "Cross-property upsell",
  feedback: "Stay feedback",
};

export const FIXED_DEST_SLUGS = [
  "story",
  "guestbook",
  "review",
  "feedback",
] as const;

const GUEST_STORY_URL =
  "https://www.thefloridahavens.com/guest-story-entry-form";
const GOOGLE_REVIEW_URL = "https://share.google/E1dS6Xok5feaJqujS";

const SLIDE_ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;

const FIXED_SLUG_DEST: Record<
  Exclude<(typeof FIXED_DEST_SLUGS)[number], "feedback">,
  string
> = {
  story: GUEST_STORY_URL,
  guestbook: GUEST_STORY_URL,
  review: GOOGLE_REVIEW_URL,
};

const ALLOWED_HOSTS = new Set([
  "thefloridahavens.com",
  "www.thefloridahavens.com",
  "share.google",
  "thefloridahavens.guestybookings.com",
]);

const FALLBACK_DEST = "https://www.thefloridahavens.com";
const PROPERTY_SLUG_SET = new Set<string>(PROPERTY_BRAND_SLUGS);
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface QrAttribution {
  property?: string | null;
  tv?: string | null;
  slide?: string | null;
}

export function portalBaseUrlForQr(): string {
  const explicit =
    process.env.NEXT_PUBLIC_PORTAL_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (prod) return `https://${prod.replace(/^https?:\/\//, "")}`;
  return "http://localhost:3100";
}

function isScanSlug(v: string): v is ScanSlug {
  return (SCAN_SLUGS as readonly string[]).includes(v);
}

function isFixedDestSlug(slug: string): slug is (typeof FIXED_DEST_SLUGS)[number] {
  return (FIXED_DEST_SLUGS as readonly string[]).includes(slug);
}

export function sanitizeSlideId(
  raw: string | null | undefined
): string | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  return SLIDE_ID_RE.test(v) ? v : null;
}

export function sanitizePropertyParam(raw: string | null | undefined): string {
  if (!raw) return "unknown";
  const v = raw.trim().toLowerCase();
  return PROPERTY_SLUG_SET.has(v) ? v : "unknown";
}

export function sanitizeTvParam(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const v = raw.trim();
  return UUID_RE.test(v) ? v.toLowerCase() : null;
}

export function propertySlugFromName(propertyName: string): string {
  return propertySlugForName(propertyName);
}

export function coarseUaClass(userAgent: string | null | undefined): string {
  const ua = (userAgent ?? "").toLowerCase();
  if (!ua) return "unknown";
  if (/(bot|spider|crawl|slurp|facebookexternalhit)/i.test(ua)) return "bot";
  if (/ipad|tablet|kindle|silk\//.test(ua)) return "tablet";
  if (/mobi|iphone|android.*mobile/.test(ua)) return "mobile";
  if (/windows|macintosh|linux|cros/.test(ua)) return "desktop";
  return "other";
}

export function scanHourBucket(date = new Date()): string {
  const d = new Date(date);
  d.setUTCMinutes(0, 0, 0);
  return d.toISOString();
}

export function isTestScanQuery(
  searchParams: URLSearchParams,
  hasHostSessionCookie: boolean
): boolean {
  if (hasHostSessionCookie) return true;
  const t = searchParams.get("t");
  return t === "1" || t === "true";
}

export function feedbackPageUrl(
  params?: { property?: string; tv?: string; slide?: string }
): string {
  const u = new URL(`${portalBaseUrlForQr()}/feedback`);
  if (params?.property) {
    u.searchParams.set("property", sanitizePropertyParam(params.property));
  }
  const tv = sanitizeTvParam(params?.tv ?? null);
  if (tv) u.searchParams.set("tv", tv);
  const slide = sanitizeSlideId(params?.slide);
  if (slide) u.searchParams.set("slide", slide);
  return u.toString();
}

function validateHttpsDest(to: string | null): string | null {
  if (!to) return null;
  try {
    const url = new URL(to);
    const host = url.hostname.toLowerCase();
    const portalHost = new URL(portalBaseUrlForQr()).hostname.toLowerCase();
    const localDev = host === "localhost" || host === "127.0.0.1";
    if (url.protocol !== "https:" && !localDev) return null;
    if (!ALLOWED_HOSTS.has(host) && host !== portalHost && !localDev) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

export function resolveScanDest(
  slug: string,
  to: string | null,
  ctx?: { property?: string; tv?: string; slide?: string }
): string | null {
  if (!isScanSlug(slug)) return null;
  if (slug === "feedback") {
    return validateHttpsDest(feedbackPageUrl(ctx)) ?? FALLBACK_DEST;
  }
  if (isFixedDestSlug(slug)) {
    const fixed = FIXED_SLUG_DEST[slug as keyof typeof FIXED_SLUG_DEST];
    return validateHttpsDest(fixed) ?? FALLBACK_DEST;
  }
  const resolved = validateHttpsDest(to);
  if (resolved) return resolved;
  return to ? null : FALLBACK_DEST;
}

export function appendQrUtm(
  dest: string,
  slug: string,
  propertySlug: string,
  tvDeviceId: string | null,
  slideId: string | null
): string {
  if (dest.startsWith("mailto:")) return dest;
  try {
    const url = new URL(dest);
    const host = url.hostname.toLowerCase();
    const localDev = host === "localhost" || host === "127.0.0.1";
    if (url.protocol !== "https:" && !localDev) return dest;
    url.searchParams.set("utm_source", "tv_qr");
    url.searchParams.set("utm_medium", propertySlug);
    url.searchParams.set("utm_campaign", slug);
    const slide = sanitizeSlideId(slideId);
    if (tvDeviceId && slide) {
      url.searchParams.set("utm_content", `${tvDeviceId}_${slide}`);
    } else if (tvDeviceId) {
      url.searchParams.set("utm_content", tvDeviceId);
    } else if (slide) {
      url.searchParams.set("utm_content", slide);
    }
    return url.toString();
  } catch {
    return dest;
  }
}

export function trackedUrl(
  slug: ScanSlug,
  dest: string,
  attr?: QrAttribution
): string {
  try {
    const mailto = dest.startsWith("mailto:");
    if (!mailto) {
      const host = new URL(dest).hostname.toLowerCase();
      const portalHost = new URL(portalBaseUrlForQr()).hostname.toLowerCase();
      if (
        !ALLOWED_HOSTS.has(host) &&
        host !== portalHost &&
        host !== "localhost"
      ) {
        return dest;
      }
    } else if (slug !== "feedback") {
      return dest;
    }
    const base = `${portalBaseUrlForQr()}/go/${slug}`;
    const u = new URL(base);
    if (!isFixedDestSlug(slug)) {
      u.searchParams.set("to", dest);
    }
    const property = attr?.property
      ? sanitizePropertyParam(attr.property)
      : null;
    if (property && property !== "unknown") {
      u.searchParams.set("property", property);
    }
    const tv = sanitizeTvParam(attr?.tv ?? null);
    if (tv) u.searchParams.set("tv", tv);
    const slide = sanitizeSlideId(attr?.slide);
    if (slide) u.searchParams.set("slide", slide);
    return u.toString();
  } catch {
    return dest;
  }
}

export function isKnownScanSlug(slug: string): slug is ScanSlug {
  return isScanSlug(slug);
}