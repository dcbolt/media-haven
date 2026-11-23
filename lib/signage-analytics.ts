import { FLORIDA_HAVENS_ORG_ID } from "./org.ts";
import {
  sanitizePropertyParam,
  sanitizeSlideId,
  scanHourBucket,
} from "./qr-attribution-core.ts";
import { purgeStaleFeedbackIfEnabled } from "./signage-feedback-purge.ts";
import {
  FEEDBACK_COMMENT_INSIGHT_RETENTION_DAYS,
  FEEDBACK_HOURLY_CAP_PER_DEVICE,
  FEEDBACK_HOURLY_CAP_PER_PROPERTY,
  FEEDBACK_HOURLY_CAP_UNTAGGED,
  FEEDBACK_TEST_HOURLY_CAP_PER_DEVICE,
  FEEDBACK_TEST_HOURLY_CAP_PER_PROPERTY,
  FEEDBACK_TEST_HOURLY_CAP_UNTAGGED,
  feedbackPropertyHourCount,
} from "./signage-guards.ts";
import { supabaseAdmin } from "./supabase.ts";

export interface ImpressionBeaconRow {
  slideId: string;
  showCount: number;
  secondsOnScreen: number;
}

export interface ImpressionBatchInput {
  propertySlug: string;
  tvDeviceId: string | null;
  isTest: boolean;
  rows: ImpressionBeaconRow[];
  shownHour?: string;
  orgId?: string;
}

export async function recordImpressionBatch(
  input: ImpressionBatchInput
): Promise<void> {
  try {
    const db = supabaseAdmin();
    if (!db || input.rows.length === 0) return;
    const hour = input.shownHour ?? scanHourBucket();
    const property = sanitizePropertyParam(input.propertySlug);
    const tv = input.tvDeviceId?.trim().toLowerCase() || null;
    const payload: {
      org_id: string;
      slide_id: string;
      property_slug: string;
      tv_device_id: string | null;
      shown_hour: string;
      show_count: number;
      seconds_on_screen: number;
      is_test: boolean;
    }[] = [];
    for (const row of input.rows) {
      const slide = sanitizeSlideId(row.slideId);
      if (!slide) continue;
      const showCount = Math.min(10_000, Math.max(0, Math.floor(row.showCount)));
      const seconds = Math.min(86_400, Math.max(0, Math.floor(row.secondsOnScreen)));
      if (showCount === 0 && seconds === 0) continue;
      payload.push({
        org_id: input.orgId ?? FLORIDA_HAVENS_ORG_ID,
        slide_id: slide,
        property_slug: property,
        tv_device_id: tv,
        shown_hour: hour,
        show_count: showCount || 1,
        seconds_on_screen: seconds,
        is_test: input.isTest,
      });
    }
    if (payload.length === 0) return;
    await db.from("tv_slide_impressions").insert(payload);
  } catch {
    /* migration may not be applied yet */
  }
}

export interface FeedbackSubmitInput {
  propertySlug: string;
  tvDeviceId: string | null;
  slideId: string | null;
  rating: number;
  comment: string | null;
  honeypot: string | null;
  isTest: boolean;
  orgId?: string;
}

export type FeedbackSubmitResult =
  | { ok: true }
  | { ok: false; reason: "rate_limited" | "invalid" | "honeypot" | "unconfigured" };

export async function submitTvFeedback(
  input: FeedbackSubmitInput
): Promise<FeedbackSubmitResult> {
  if (input.honeypot?.trim()) return { ok: false, reason: "honeypot" };
  const rating = Math.floor(input.rating);
  if (rating < 1 || rating > 5) return { ok: false, reason: "invalid" };
  const comment = input.comment?.trim().slice(0, 500) || null;
  const db = supabaseAdmin();
  if (!db) return { ok: false, reason: "unconfigured" };

  const property = sanitizePropertyParam(input.propertySlug);
  const tv = input.tvDeviceId?.trim().toLowerCase() || null;
  const slide = sanitizeSlideId(input.slideId);
  const hour = scanHourBucket();
  const orgId = input.orgId ?? FLORIDA_HAVENS_ORG_ID;

  const propCount = await feedbackPropertyHourCount(
    property,
    input.isTest,
    orgId
  );
  const propertyCap = input.isTest
    ? tv
      ? FEEDBACK_TEST_HOURLY_CAP_PER_PROPERTY
      : FEEDBACK_TEST_HOURLY_CAP_UNTAGGED
    : tv
      ? FEEDBACK_HOURLY_CAP_PER_PROPERTY
      : FEEDBACK_HOURLY_CAP_UNTAGGED;
  if (propCount >= propertyCap) {
    return { ok: false, reason: "rate_limited" };
  }
  if (tv) {
    const deviceCap = input.isTest
      ? FEEDBACK_TEST_HOURLY_CAP_PER_DEVICE
      : FEEDBACK_HOURLY_CAP_PER_DEVICE;
    const { count } = await db
      .from("tv_feedback_submissions")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("property_slug", property)
      .eq("tv_device_id", tv)
      .eq("submitted_hour", hour)
      .eq("is_test", input.isTest);
    if ((count ?? 0) >= deviceCap) {
      return { ok: false, reason: "rate_limited" };
    }
  }

  const { error } = await db.from("tv_feedback_submissions").insert({
    org_id: input.orgId ?? FLORIDA_HAVENS_ORG_ID,
    property_slug: property,
    tv_device_id: tv,
    slide_id: slide,
    rating,
    comment,
    submitted_hour: hour,
    is_test: input.isTest,
  });
  if (error) return { ok: false, reason: "unconfigured" };
  void purgeStaleFeedbackIfEnabled().catch(() => {});
  return { ok: true };
}

export interface SignageInsightRow {
  slideId: string;
  propertySlug: string;
  tvDeviceId: string | null;
  impressions: number;
  secondsOnScreen: number;
  scans: number;
  scanRatePer100: number | null;
  ratingAvg: number | null;
  ratingCount: number;
  latestComments: { rating: number; comment: string | null; at: string }[];
}

export async function loadSignageInsights(
  days: 7 | 30 = 7,
  orgId: string = FLORIDA_HAVENS_ORG_ID
): Promise<SignageInsightRow[] | null> {
  const db = supabaseAdmin();
  if (!db) return null;
  const since = new Date(
    Date.now() - days * 86_400_000
  ).toISOString();
  const commentSince = new Date(
    Date.now() - FEEDBACK_COMMENT_INSIGHT_RETENTION_DAYS * 86_400_000
  ).toISOString();

  const [impressions, scans, feedback] = await Promise.all([
    db
      .from("tv_slide_impressions")
      .select("slide_id, property_slug, tv_device_id, show_count, seconds_on_screen")
      .eq("org_id", orgId)
      .eq("is_test", false)
      .gte("shown_hour", since),
    db
      .from("qr_scan_events")
      .select("slide_id, property_slug, tv_device_id")
      .eq("org_id", orgId)
      .eq("is_test", false)
      .gte("scanned_hour", since),
    db
      .from("tv_feedback_submissions")
      .select("slide_id, property_slug, tv_device_id, rating, comment, created_at")
      .eq("org_id", orgId)
      .eq("is_test", false)
      .gte("submitted_hour", since)
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  if (impressions.error || scans.error || feedback.error) return null;

  const map = new Map<string, SignageInsightRow>();

  const keyOf = (slide: string, property: string, tv: string | null) =>
    `${slide}\0${property}\0${tv ?? ""}`;

  const ensure = (slide: string, property: string, tv: string | null) => {
    const k = keyOf(slide, property, tv);
    let row = map.get(k);
    if (!row) {
      row = {
        slideId: slide,
        propertySlug: property,
        tvDeviceId: tv,
        impressions: 0,
        secondsOnScreen: 0,
        scans: 0,
        scanRatePer100: null,
        ratingAvg: null,
        ratingCount: 0,
        latestComments: [],
      };
      map.set(k, row);
    }
    return row;
  };

  for (const row of impressions.data ?? []) {
    const slide = String(row.slide_id ?? "unknown");
    const property = String(row.property_slug ?? "unknown");
    const tv = row.tv_device_id ? String(row.tv_device_id) : null;
    const hit = ensure(slide, property, tv);
    hit.impressions += Number(row.show_count) || 0;
    hit.secondsOnScreen += Number(row.seconds_on_screen) || 0;
  }

  for (const row of scans.data ?? []) {
    const slide = row.slide_id ? String(row.slide_id) : "unknown";
    const property = String(row.property_slug ?? "unknown");
    const tv = row.tv_device_id ? String(row.tv_device_id) : null;
    ensure(slide, property, tv).scans += 1;
  }

  const ratingSum = new Map<string, number>();
  for (const row of feedback.data ?? []) {
    const slide = String(row.slide_id ?? "unknown");
    const property = String(row.property_slug ?? "unknown");
    const tv = row.tv_device_id ? String(row.tv_device_id) : null;
    const hit = ensure(slide, property, tv);
    const rating = Number(row.rating) || 0;
    hit.ratingCount += 1;
    ratingSum.set(keyOf(slide, property, tv), (ratingSum.get(keyOf(slide, property, tv)) ?? 0) + rating);
    const createdAt = String(row.created_at);
    if (
      hit.latestComments.length < 3 &&
      (row.comment || rating) &&
      createdAt >= commentSince
    ) {
      hit.latestComments.push({
        rating,
        comment: row.comment ? String(row.comment) : null,
        at: createdAt,
      });
    }
  }

  for (const row of map.values()) {
    if (row.impressions > 0) {
      row.scanRatePer100 = Math.round((row.scans / row.impressions) * 10_000) / 100;
    }
    const sum = ratingSum.get(keyOf(row.slideId, row.propertySlug, row.tvDeviceId));
    if (sum != null && row.ratingCount > 0) {
      row.ratingAvg = Math.round((sum / row.ratingCount) * 10) / 10;
    }
  }

  return [...map.values()].sort(
    (a, b) =>
      b.impressions - a.impressions || b.scans - a.scans || b.secondsOnScreen - a.secondsOnScreen
  );
}