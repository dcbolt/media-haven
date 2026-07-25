import { FLORIDA_HAVENS_ORG_ID } from "./org";
import { supabaseAdmin } from "./supabase";
import { portalBaseUrl } from "./tokens";

/**
 * QR scan analytics (host request 2026-07-24). Every guest-facing QR encodes
 * a first-party redirect — /go/<slug>?to=<dest> — which counts the scan and
 * 302s to the real destination, so the host dashboard can show how much
 * guests actually interact with each pitch (book, extend, story, review…).
 *
 * Counters live on orgs.settings.qrScans as `${slug}:${YYYY-MM-DD}` → count
 * (settings-jsonb era, no migrations). Guest-scale traffic makes the
 * read-modify-write race window acceptable; counts are directional, not
 * billing-grade. Destinations are validated against an exact host
 * allowlist so /go can never be used as an open redirect.
 */

export const SCAN_SLUGS = [
  "book",
  "rebook",
  "extend",
  "story",
  "review",
  "portal",
  "upsell",
] as const;
export type ScanSlug = (typeof SCAN_SLUGS)[number];

export const SLUG_LABELS: Record<ScanSlug, string> = {
  book: "Book direct",
  rebook: "Next-year rebook",
  extend: "Extend stay",
  story: "Guest book",
  review: "Google review",
  portal: "Guest portal",
  upsell: "Cross-property upsell",
};

const ALLOWED_HOSTS = new Set([
  "thefloridahavens.com",
  "www.thefloridahavens.com",
  "share.google",
  "thefloridahavens.guestybookings.com",
]);

const FALLBACK_DEST = "https://www.thefloridahavens.com";
const MAX_COUNTER_KEYS = 500;

function isScanSlug(v: string): v is ScanSlug {
  return (SCAN_SLUGS as readonly string[]).includes(v);
}

/** Wrap a destination in the tracked redirect. Unknown/unsafe destinations
 *  come back unwrapped — a QR must never dead-end because of analytics. */
export function trackedUrl(slug: ScanSlug, dest: string): string {
  try {
    const host = new URL(dest).hostname.toLowerCase();
    const portalHost = new URL(portalBaseUrl()).hostname.toLowerCase();
    if (!ALLOWED_HOSTS.has(host) && host !== portalHost && host !== "localhost") {
      return dest;
    }
    return `${portalBaseUrl()}/go/${slug}?to=${encodeURIComponent(dest)}`;
  } catch {
    return dest;
  }
}

/** Validate a /go request's target. Null when the slug or dest is bogus. */
export function resolveScanDest(slug: string, to: string | null): string | null {
  if (!isScanSlug(slug)) return null;
  if (!to) return FALLBACK_DEST;
  try {
    const url = new URL(to);
    const host = url.hostname.toLowerCase();
    const portalHost = new URL(portalBaseUrl()).hostname.toLowerCase();
    if (url.protocol !== "https:" && host !== "localhost") return null;
    if (!ALLOWED_HOSTS.has(host) && host !== portalHost && host !== "localhost") {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

/** Count one scan. Never throws — a broken counter must not break the
 *  redirect that a guest is mid-scan on. */
export async function recordScan(
  slug: ScanSlug,
  orgId: string = FLORIDA_HAVENS_ORG_ID
): Promise<void> {
  try {
    const db = supabaseAdmin();
    if (!db) return;
    const { data: row } = await db
      .from("orgs")
      .select("settings")
      .eq("id", orgId)
      .maybeSingle();
    if (!row) return;
    const prev =
      row.settings && typeof row.settings === "object"
        ? (row.settings as Record<string, unknown>)
        : {};
    const scans =
      prev.qrScans && typeof prev.qrScans === "object"
        ? { ...(prev.qrScans as Record<string, number>) }
        : {};
    const key = `${slug}:${new Date().toISOString().slice(0, 10)}`;
    scans[key] = (Number(scans[key]) || 0) + 1;
    // Prune oldest day-keys so the settings row never grows unbounded.
    const keys = Object.keys(scans);
    if (keys.length > MAX_COUNTER_KEYS) {
      keys
        .sort((a, b) => a.slice(-10).localeCompare(b.slice(-10)))
        .slice(0, keys.length - MAX_COUNTER_KEYS)
        .forEach((k) => delete scans[k]);
    }
    await db
      .from("orgs")
      .update({ settings: { ...prev, qrScans: scans } })
      .eq("id", orgId);
  } catch {
    // analytics best-effort only
  }
}

export interface ScanSeries {
  dates: string[]; // YYYY-MM-DD ascending
  series: { slug: string; label: string; values: number[]; total: number }[];
}

/** Daily scan counts for the dashboard chart: top-3 targets by volume plus
 *  "Other" (categorical series ladder — never more than 4 hues). */
export async function loadScanSeries(
  days = 14,
  orgId: string = FLORIDA_HAVENS_ORG_ID
): Promise<ScanSeries | null> {
  const db = supabaseAdmin();
  if (!db) return null;
  const { data } = await db
    .from("orgs")
    .select("settings")
    .eq("id", orgId)
    .maybeSingle();
  const settings =
    data?.settings && typeof data.settings === "object"
      ? (data.settings as Record<string, unknown>)
      : {};
  const scans =
    settings.qrScans && typeof settings.qrScans === "object"
      ? (settings.qrScans as Record<string, number>)
      : {};
  const dates = Array.from({ length: days }, (_, i) =>
    new Date(Date.now() - (days - 1 - i) * 86_400_000).toISOString().slice(0, 10)
  );
  const per = SCAN_SLUGS.map((slug) => {
    const values = dates.map((d) => Number(scans[`${slug}:${d}`]) || 0);
    return { slug, label: SLUG_LABELS[slug], values, total: values.reduce((a, b) => a + b, 0) };
  }).sort((a, b) => b.total - a.total);
  const top = per.slice(0, 3).filter((s) => s.total > 0);
  const rest = per.slice(3).filter((s) => s.total > 0);
  const series: ScanSeries["series"] = [...top];
  if (rest.length > 0) {
    series.push({
      slug: "other",
      label: "Other",
      values: dates.map((_, i) => rest.reduce((a, s) => a + s.values[i], 0)),
      total: rest.reduce((a, s) => a + s.total, 0),
    });
  }
  return { dates, series };
}

export interface ScanStats {
  slug: ScanSlug;
  label: string;
  today: number;
  last7: number;
  last30: number;
}

export async function loadScanStats(
  orgId: string = FLORIDA_HAVENS_ORG_ID
): Promise<ScanStats[] | null> {
  const db = supabaseAdmin();
  if (!db) return null;
  const { data } = await db
    .from("orgs")
    .select("settings")
    .eq("id", orgId)
    .maybeSingle();
  const settings =
    data?.settings && typeof data.settings === "object"
      ? (data.settings as Record<string, unknown>)
      : {};
  const scans =
    settings.qrScans && typeof settings.qrScans === "object"
      ? (settings.qrScans as Record<string, number>)
      : {};
  const today = new Date().toISOString().slice(0, 10);
  const since = (days: number) =>
    new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const d7 = since(7);
  const d30 = since(30);
  return SCAN_SLUGS.map((slug) => {
    let t = 0,
      w = 0,
      m = 0;
    for (const [key, raw] of Object.entries(scans)) {
      if (!key.startsWith(`${slug}:`)) continue;
      const day = key.slice(-10);
      const n = Number(raw) || 0;
      if (day === today) t += n;
      if (day >= d7) w += n;
      if (day >= d30) m += n;
    }
    return { slug, label: SLUG_LABELS[slug], today: t, last7: w, last30: m };
  });
}
