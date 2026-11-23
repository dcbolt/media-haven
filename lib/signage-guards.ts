import { FLORIDA_HAVENS_ORG_ID } from "./org.ts";
import { scanHourBucket } from "./qr-attribution-core.ts";
import {
  resolvePairedTvByDeviceId,
  resolvePairedTvByTag,
  type PairedTvRef,
} from "./tv-attribution-resolve.ts";
import { supabaseAdmin } from "./supabase.ts";

export const IMPRESSION_BURST_ROWS_PER_MIN = 120;
export const IMPRESSION_DAILY_ROW_CAP = 2500;

export const FEEDBACK_HOURLY_CAP_PER_DEVICE = 20;
export const FEEDBACK_HOURLY_CAP_PER_PROPERTY = 40;
export const FEEDBACK_HOURLY_CAP_UNTAGGED = 8;

/** Guest feedback comments shown in insights; longer DB retention may exist elsewhere. */
export const FEEDBACK_COMMENT_INSIGHT_RETENTION_DAYS = 90;

export async function resolveImpressionDevice(body: {
  deviceId?: string;
  attributionTag?: string;
}): Promise<PairedTvRef | null> {
  const fromTag = await resolvePairedTvByTag(body.attributionTag);
  if (fromTag) return fromTag;
  return resolvePairedTvByDeviceId(body.deviceId ?? null);
}

export async function impressionGuards(
  paired: PairedTvRef,
  pendingRows: number
): Promise<"ok" | "rate_limited" | "unknown_device"> {
  const db = supabaseAdmin();
  if (!db) return "unknown_device";
  const minuteAgo = new Date(Date.now() - 60_000).toISOString();
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);

  const { count: minuteCount } = await db
    .from("tv_slide_impressions")
    .select("id", { count: "exact", head: true })
    .eq("tv_device_id", paired.deviceId)
    .gte("created_at", minuteAgo)
    .eq("is_test", false);

  if ((minuteCount ?? 0) + pendingRows > IMPRESSION_BURST_ROWS_PER_MIN) {
    return "rate_limited";
  }

  const { count: dayCount } = await db
    .from("tv_slide_impressions")
    .select("id", { count: "exact", head: true })
    .eq("tv_device_id", paired.deviceId)
    .gte("created_at", dayStart.toISOString())
    .eq("is_test", false);

  if ((dayCount ?? 0) + pendingRows > IMPRESSION_DAILY_ROW_CAP) {
    return "rate_limited";
  }

  return "ok";
}

export async function feedbackPropertyHourCount(
  propertySlug: string,
  orgId: string = FLORIDA_HAVENS_ORG_ID
): Promise<number> {
  const db = supabaseAdmin();
  if (!db) return 0;
  const hour = scanHourBucket();
  const { count } = await db
    .from("tv_feedback_submissions")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("property_slug", propertySlug)
    .eq("submitted_hour", hour)
    .eq("is_test", false);
  return count ?? 0;
}