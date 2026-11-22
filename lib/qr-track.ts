import { FLORIDA_HAVENS_ORG_ID } from "./org";
import { patchOrgSettingsMutate } from "./org-settings-cas";
import { supabaseAdmin } from "./supabase";
import { portalBaseUrl } from "./tokens";

export {
  SCAN_SLUGS,
  SLUG_LABELS,
  FIXED_DEST_SLUGS,
  type ScanSlug,
  type QrAttribution,
  sanitizeSlideId,
  sanitizePropertyParam,
  sanitizeTvParam,
  propertySlugFromName,
  coarseUaClass,
  scanHourBucket,
  isTestScanQuery,
  feedbackPageUrl,
  resolveScanDest,
  appendQrUtm,
  trackedUrl,
  isKnownScanSlug,
} from "./qr-attribution-core";

import {
  SCAN_SLUGS,
  SLUG_LABELS,
  sanitizePropertyParam,
  sanitizeSlideId,
  sanitizeTvParam,
  scanHourBucket,
  type ScanSlug,
} from "./qr-attribution-core";

/**
 * QR scan analytics (host request 2026-07-24, attribution 2026-11-22). Every
 * guest-facing QR encodes a first-party redirect — /go/<slug> — which counts
 * the scan and 302s with UTMs. Row-level attribution: qr_scan_events (0025).
 * Legacy daily counters: orgs.settings.qrScans. No IP / full UA / guest PII.
 */

const MAX_COUNTER_KEYS = 500;

function isScanSlug(v: string): v is ScanSlug {
  return (SCAN_SLUGS as readonly string[]).includes(v);
}

/** Re-export for callers that need the live portal origin. */
export { portalBaseUrl };

export interface ScanRecordInput {
  slug: ScanSlug;
  propertySlug: string;
  tvDeviceId: string | null;
  slideId: string | null;
  uaClass: string;
  isTest: boolean;
  scannedHour?: string;
  orgId?: string;
}

export async function recordScanEvent(input: ScanRecordInput): Promise<void> {
  try {
    const db = supabaseAdmin();
    if (!db) return;
    const row = {
      org_id: input.orgId ?? FLORIDA_HAVENS_ORG_ID,
      slug: input.slug,
      property_slug: sanitizePropertyParam(input.propertySlug),
      tv_device_id: input.tvDeviceId,
      slide_id: sanitizeSlideId(input.slideId),
      scanned_hour: input.scannedHour ?? scanHourBucket(),
      ua_class: input.uaClass.slice(0, 32),
      is_test: input.isTest,
    };
    await db.from("qr_scan_events").insert(row);
  } catch {
    // table may not exist until migration 0025 is applied
  }
}

export async function recordScan(
  slug: ScanSlug,
  orgId: string = FLORIDA_HAVENS_ORG_ID
): Promise<void> {
  try {
    const db = supabaseAdmin();
    if (!db) return;
    const day = new Date().toISOString().slice(0, 10);
    const key = `${slug}:${day}`;
    await patchOrgSettingsMutate(
      orgId,
      (prev) => {
        const scans =
          prev.qrScans && typeof prev.qrScans === "object"
            ? { ...(prev.qrScans as Record<string, number>) }
            : {};
        scans[key] = (Number(scans[key]) || 0) + 1;
        const keys = Object.keys(scans);
        if (keys.length > MAX_COUNTER_KEYS) {
          keys
            .sort((a, b) => a.slice(-10).localeCompare(b.slice(-10)))
            .slice(0, keys.length - MAX_COUNTER_KEYS)
            .forEach((k) => delete scans[k]);
        }
        return { ...prev, qrScans: scans };
      },
      db
    );
  } catch {
    // analytics best-effort only
  }
}

export interface ScanSeries {
  dates: string[];
  series: { slug: string; label: string; values: number[]; total: number }[];
}

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
    return {
      slug,
      label: SLUG_LABELS[slug],
      values,
      total: values.reduce((a, b) => a + b, 0),
    };
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

export interface ScanBreakdownRow {
  slug: string;
  label: string;
  slideId: string | null;
  propertySlug: string;
  tvDeviceId: string | null;
  count: number;
}

export async function loadScanBreakdown(
  days: 7 | 30 = 7,
  orgId: string = FLORIDA_HAVENS_ORG_ID
): Promise<ScanBreakdownRow[] | null> {
  const db = supabaseAdmin();
  if (!db) return null;
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data, error } = await db
    .from("qr_scan_events")
    .select("slug, slide_id, property_slug, tv_device_id")
    .eq("org_id", orgId)
    .eq("is_test", false)
    .gte("scanned_hour", since);
  if (error) return null;
  const counts = new Map<string, ScanBreakdownRow>();
  for (const row of data ?? []) {
    const slug = String(row.slug);
    const propertySlug = String(row.property_slug ?? "unknown");
    const tvDeviceId = row.tv_device_id ? String(row.tv_device_id) : null;
    const slideId = row.slide_id ? String(row.slide_id) : null;
    const key = `${slug}\0${slideId ?? ""}\0${propertySlug}\0${tvDeviceId ?? ""}`;
    const hit = counts.get(key);
    if (hit) hit.count += 1;
    else {
      const label = isScanSlug(slug) ? SLUG_LABELS[slug] : slug;
      counts.set(key, {
        slug,
        label,
        slideId,
        propertySlug,
        tvDeviceId,
        count: 1,
      });
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count);
}