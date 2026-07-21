/**
 * S0.2 — TV offline / stale alerts (fleet ops).
 *
 * Sweep linked TVs whose last_seen is older than a host-tunable threshold
 * (app_config `tv_offline_threshold_minutes`, default 15). Email host
 * allowlist via Resend when RESEND_API_KEY is set; otherwise log
 * skipped:no-provider (same dormant pattern as Phase 1.8 launch alerts).
 *
 * Idempotent: one open incident per device until it polls again (recovered).
 */

import { sendEmail, providerStatus } from "./alerts";
import { signageName } from "./content";
import { supabaseAdmin } from "./supabase";

const DEFAULT_THRESHOLD_MIN = 15;
const CONFIG_KEY = "tv_offline_threshold_minutes";

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

/** Host email recipients: app_config host_allowed_emails, else env. */
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
  const fromDb = (data?.value || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set([...fromDb, ...fromEnv])];
}

export async function runTvOfflineAlerts(
  dry = false
): Promise<OfflineAlertSummary> {
  const db = supabaseAdmin();
  const emailConfigured = providerStatus().email;
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
  };
  if (!db) return summary;

  const cutoff = new Date(Date.now() - thresholdMin * 60_000).toISOString();

  // Linked devices only (pairing screens don't need ops pages).
  const { data: devices } = await db
    .from("tv_devices")
    .select(
      "id, label, pair_code, property_id, last_seen, properties (name)"
    )
    .not("property_id", "is", null);

  const list = devices ?? [];
  summary.scanned = list.length;

  // Open incidents (not recovered).
  const { data: openRows } = await db
    .from("tv_offline_alerts")
    .select("id, tv_device_id")
    .is("recovered_at", null);
  const openByDevice = new Map(
    (openRows ?? []).map((r) => [r.tv_device_id as string, r.id as string])
  );

  const recipients = await hostRecipients();

  for (const d of list) {
    const id = d.id as string;
    const lastSeen = d.last_seen as string;
    const stale = lastSeen < cutoff;
    const openId = openByDevice.get(id);

    if (!stale && openId) {
      // Back online — close incident.
      if (!dry) {
        await db
          .from("tv_offline_alerts")
          .update({
            recovered_at: new Date().toISOString(),
            status: "recovered",
          })
          .eq("id", openId);
      }
      summary.recovered++;
      continue;
    }

    if (!stale || openId) continue;

    // Newly stale with no open incident.
    summary.newlyStale++;
    const property = Array.isArray(d.properties)
      ? d.properties[0]
      : d.properties;
    const propertyName = property?.name
      ? signageName(property.name)
      : "Unknown property";
    const room = (d.label as string | null)?.trim() || "Unnamed TV";
    const code = d.pair_code as string;

    let status = "sent";
    if (dry) {
      summary.skipped++;
      continue;
    }

    if (!emailConfigured || recipients.length === 0) {
      status =
        recipients.length === 0
          ? "skipped:no-recipients"
          : "skipped:no-provider";
      summary.skipped++;
    } else {
      const subject = `TV offline: ${room} · ${propertyName}`;
      const text = [
        `A Florida Havens TV stopped polling.`,
        ``,
        `Room: ${room}`,
        `Property: ${propertyName}`,
        `Pair code: ${code}`,
        `Last seen: ${lastSeen}`,
        `Threshold: ${thresholdMin} minutes`,
        ``,
        `Check power/Wi‑Fi/kiosk, or open Host → TVs.`,
        ``,
        `— Stay OS fleet (S0.2)`,
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
      last_seen_at: lastSeen,
    });
    if (error) {
      // Unique open-index race: another cron tick claimed it.
      summary.errors++;
    }
  }

  return summary;
}
