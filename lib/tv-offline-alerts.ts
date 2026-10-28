/**
 * S0.2 + P9 — TV offline / stale alerts (fleet ops).
 */

import { sendEmail, providerStatus } from "./alerts";
import { signageName } from "./content";
import {
  alertHeartbeatIso,
  effectiveOfflineThresholdMinutes,
  isDeviceStaleForAlerts,
  shouldSuppressNewOfflineIncident,
} from "./offline-alert-policy";
import { loadDeviceReportsForDevices } from "./tv-device-report-store";
import { supabaseAdmin } from "./supabase";

export const DEFAULT_THRESHOLD_MIN = 15;
const CONFIG_KEY = "tv_offline_threshold_minutes";
export const OFFLINE_EMAILS_FLAG_KEY = "offline_alert_emails_enabled";

export async function getTvOfflineThresholdMinutes(): Promise<number> {
  return thresholdMinutes();
}

export async function getOfflineAlertEmailsEnabled(): Promise<boolean> {
  const db = supabaseAdmin();
  if (!db) return false;
  const { data } = await db
    .from("app_config")
    .select("value")
    .eq("key", OFFLINE_EMAILS_FLAG_KEY)
    .maybeSingle();
  const v = String(data?.value ?? "")
    .trim()
    .toLowerCase();
  return v === "true" || v === "1" || v === "on";
}

export type OfflineAlertSummary = {
  thresholdMin: number;
  scanned: number;
  newlyStale: number;
  sent: number;
  skipped: number;
  recovered: number;
  errors: number;
  dry: boolean;
  emailConfigured: boolean;
  emailsEnabled: boolean;
};

async function thresholdMinutes(): Promise<number> {
  const db = supabaseAdmin();
  if (!db) return DEFAULT_THRESHOLD_MIN;
  const { data } = await db
    .from("app_config")
    .select("value")
    .eq("key", CONFIG_KEY)
    .maybeSingle();
  const n = Number(data?.value);
  if (Number.isFinite(n) && n >= 2 && n <= 24 * 60) return Math.floor(n);
  return DEFAULT_THRESHOLD_MIN;
}

async function hostRecipients(): Promise<string[]> {
  const db = supabaseAdmin();
  const fromEnv = (process.env.HOST_ALERT_EMAILS || process.env.ALERTS_HOST_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (!db) return fromEnv;
  const { data } = await db
    .from("app_config")
    .select("value")
    .eq("key", "host_allowed_emails")
    .maybeSingle();
  const fromDb = String(data?.value || "")
    .split(",")
    .map((s: string) => s.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set([...fromDb, ...fromEnv])];
}

export async function runTvOfflineAlerts(
  dry = false,
  nowMs: number = Date.now()
): Promise<OfflineAlertSummary> {
  const db = supabaseAdmin();
  const emailConfigured = providerStatus().email;
  const emailsEnabled = await getOfflineAlertEmailsEnabled();
  const thresholdMin = await thresholdMinutes();
  const summary: OfflineAlertSummary = {
    thresholdMin,
    scanned: 0,
    newlyStale: 0,
    sent: 0,
    skipped: 0,
    recovered: 0,
    errors: 0,
    dry,
    emailConfigured,
    emailsEnabled,
  };
  if (!db) return summary;

  const { data: devices } = await db
    .from("tv_devices")
    .select(
      "id, label, pair_code, property_id, last_seen, properties (name)"
    )
    .not("property_id", "is", null);

  const list = devices ?? [];
  summary.scanned = list.length;

  const deviceIds = list.map((d) => d.id as string);
  const reports = await loadDeviceReportsForDevices(deviceIds);

  const { data: openRows } = await db
    .from("tv_offline_alerts")
    .select("id, tv_device_id")
    .is("recovered_at", null);
  const openByDevice = new Map(
    (openRows ?? []).map((r) => [r.tv_device_id as string, r.id as string])
  );

  const recipients = await hostRecipients();
  const maySendEmail = emailsEnabled && emailConfigured && recipients.length > 0;

  for (const d of list) {
    const id = d.id as string;
    const entry = reports[id];
    const lastSeen = d.last_seen as string;
    const heartbeat = alertHeartbeatIso(entry, lastSeen, nowMs);
    const thresh = effectiveOfflineThresholdMinutes(entry, thresholdMin, nowMs);
    const stale = isDeviceStaleForAlerts(heartbeat, thresh, nowMs);
    const openId = openByDevice.get(id);

    if (!stale && openId) {
      if (!dry) {
        await db
          .from("tv_offline_alerts")
          .update({
            recovered_at: new Date(nowMs).toISOString(),
            status: "recovered",
          })
          .eq("id", openId);
      }
      summary.recovered++;
      if (!dry && maySendEmail) {
        const property = Array.isArray(d.properties)
          ? d.properties[0]
          : d.properties;
        const propertyName = property?.name
          ? signageName(property.name)
          : "Unknown property";
        const room = (d.label as string | null)?.trim() || "Unnamed TV";
        const subject = `TV back online: ${room} · ${propertyName}`;
        const text = [
          `A Florida Havens screen is reporting again.`,
          ``,
          `Room: ${room}`,
          `Property: ${propertyName}`,
          `Last heartbeat: ${heartbeat}`,
          ``,
          `— Stay OS fleet`,
        ].join("\n");
        for (const to of recipients) {
          await sendEmail(to, subject, text);
        }
      }
      continue;
    }

    if (!stale || openId) continue;

    if (shouldSuppressNewOfflineIncident(entry, nowMs)) {
      continue;
    }

    summary.newlyStale++;
    const property = Array.isArray(d.properties)
      ? d.properties[0]
      : d.properties;
    const propertyName = property?.name
      ? signageName(property.name)
      : "Unknown property";
    const room = (d.label as string | null)?.trim() || "Unnamed TV";
    const code = d.pair_code as string;
    const type = entry?.report.reportedType ?? "unknown";

    let status = "sent";
    if (dry) {
      summary.skipped++;
      continue;
    }

    if (!maySendEmail) {
      status = !emailsEnabled
        ? "skipped:emails-disabled"
        : recipients.length === 0
          ? "skipped:no-recipients"
          : "skipped:no-provider";
      summary.skipped++;
    } else {
      const subject = `TV offline: ${room} · ${propertyName}`;
      const text = [
        `A Florida Havens screen stopped reporting.`,
        ``,
        `Room: ${room}`,
        `Property: ${propertyName}`,
        `Type: ${type}`,
        `Pair code: ${code}`,
        `Last heartbeat: ${heartbeat}`,
        `Threshold: ${thresh} minutes`,
        ``,
        `Check power/Wi‑Fi/kiosk, or open Host → Screens & Devices.`,
        ``,
        `— Stay OS fleet`,
      ].join("\n");

      let anyOk = false;
      let lastReason = "no-provider";
      for (const to of recipients) {
        const r = await sendEmail(to, subject, text);
        if (r.ok) anyOk = true;
        else lastReason = r.reason || "error";
      }
      if (anyOk) {
        status = "sent";
        summary.sent++;
      } else {
        status = `error:${lastReason}`;
        summary.errors++;
      }
    }

    const { error } = await db.from("tv_offline_alerts").insert({
      tv_device_id: id,
      property_id: d.property_id,
      status,
      last_seen_at: heartbeat,
    });
    if (error) {
      summary.errors++;
    }
  }

  return summary;
}
