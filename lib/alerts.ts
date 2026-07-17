import { createHmac } from "crypto";
import { fetchUpcomingLaunches, type UpcomingLaunch } from "./launches";
import { signageName } from "./content";
import { supabaseAdmin } from "./supabase";
import { ensureGuestToken } from "./tokens";

/**
 * Phase 1.8 — launch-alert sending pipeline. Copy is Grok's accepted spec
 * (cycle 4 §5: T-24h / T-1h; cycle 5 §3: scrub / delay). Rules:
 * - Only in-house, opted-in, not-unsubscribed subscribers get alerts.
 * - SMS respects quiet hours (10 PM–8 AM America/New_York); email any time.
 * - Scrub/delay only after a prior alert for that launch actually went out,
 *   and at most once each per launch (prefer one message over a chain).
 * - Never promise visibility — "often visible" only (in the copy).
 * - Idempotent: launch_alerts unique index means a 15-min cron can re-run
 *   forever without double-sending.
 *
 * Providers are optional: without RESEND_API_KEY / TWILIO_* env the run
 * still executes and logs skipped:no-provider — the pipeline is fully
 * testable before credentials exist.
 */

type Kind = "t24" | "t1" | "delay" | "scrub";
type Channel = "email" | "sms";

const EASTERN = "America/New_York";

function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

function netLocal(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: EASTERN,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** SMS quiet hours: 10 PM–8 AM Eastern (Grok pipeline rule). */
export function inQuietHours(now = new Date()): boolean {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: EASTERN,
      hour: "numeric",
      hour12: false,
    }).format(now)
  );
  return hour >= 22 || hour < 8;
}

/* ── Unsubscribe links ──────────────────────────────────────────────── */

function alertsSecret(): string {
  return (
    process.env.ALERTS_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "fh-alerts-dev"
  );
}

export function unsubscribeSig(email: string): string {
  return createHmac("sha256", `fh-unsub-${alertsSecret()}`)
    .update(email.trim().toLowerCase())
    .digest("hex")
    .slice(0, 32);
}

export function unsubscribeUrl(email: string, base: string): string {
  const e = Buffer.from(email.trim().toLowerCase(), "utf8").toString("base64url");
  return `${base}/api/subscribe/unsubscribe?e=${e}&s=${unsubscribeSig(email)}`;
}

/* ── Templates (Grok cycle 4 §5 + cycle 5 §3, verbatim) ─────────────── */

type Vars = {
  guest_first_name: string;
  property_name: string;
  launch_name: string;
  net_local: string;
  new_net_local: string;
  status: string;
  portal_url: string;
  unsubscribe_url: string;
};

function fill(t: string, v: Vars): string {
  return t.replace(/\{\{(\w+)\}\}/g, (_, k: string) =>
    String(v[k as keyof Vars] ?? "")
  );
}

const EMAIL_SUBJECT: Record<Kind, string> = {
  t24: "Rocket watch tomorrow from {{property_name}}",
  t1: "Launch window opening soon — {{property_name}}",
  scrub: "Update: {{launch_name}} is off the board",
  delay: "Update: {{launch_name}} moved — new window {{new_net_local}}",
};

const EMAIL_BODY: Record<Kind, string> = {
  t24: `Hi {{guest_first_name}},

A launch is currently scheduled for tomorrow from the Cape — often visible from the beach at {{property_name}}.

• Mission: {{launch_name}}
• Window (local): {{net_local}}
• Status: {{status}}

Schedules slip. For the latest, open your stay portal: {{portal_url}}

Watch tip: ocean-facing deck or the sand, phone lights low if it's turtle season.

— The Florida Havens
Unsubscribe: {{unsubscribe_url}}`,
  t1: `Hi {{guest_first_name}},

T-minus about an hour for {{launch_name}} ({{net_local}} local · {{status}}).

If the sky is clear, step outside — Melbourne Beach often gets a clean view up the coast.

Live details: {{portal_url}}

— The Florida Havens
Unsubscribe: {{unsubscribe_url}}`,
  scrub: `Hi {{guest_first_name}},

Quick update: {{launch_name}} is no longer going as previously scheduled (status: {{status}}).

No need to plan around a window tonight. We'll only ping again if a new firm opportunity shows up during your stay.

Live board: {{portal_url}}

— The Florida Havens
Unsubscribe: {{unsubscribe_url}}`,
  delay: `Hi {{guest_first_name}},

{{launch_name}} slipped. New no-earlier-than (local): {{new_net_local}} (status: {{status}}).

Schedules change — treat this as best-effort. We'll send another note only if it moves again or scrubs.

Portal: {{portal_url}}

— The Florida Havens
Unsubscribe: {{unsubscribe_url}}`,
};

const SMS: Record<Kind, string> = {
  t24: "FH: Launch tomorrow ~{{net_local}} ({{launch_name}}). Watch from {{property_name}} beach. Updates: {{portal_url}}",
  t1: "FH: Launch window ~now ({{launch_name}}). Look north from the beach/deck. {{portal_url}}",
  scrub: "FH: {{launch_name}} scrubbed/off. No beach window tonight. {{portal_url}}",
  delay: "FH: {{launch_name}} delayed → ~{{new_net_local}}. Updates: {{portal_url}}",
};

/* ── Providers ──────────────────────────────────────────────────────── */

type SendResult = { ok: boolean; reason?: string };

export function providerStatus(): { email: boolean; sms: boolean } {
  return {
    email: Boolean(process.env.RESEND_API_KEY),
    sms: Boolean(
      process.env.TWILIO_ACCOUNT_SID &&
        process.env.TWILIO_AUTH_TOKEN &&
        process.env.TWILIO_FROM_NUMBER
    ),
  };
}

async function sendEmail(
  to: string,
  subject: string,
  text: string
): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, reason: "no-provider" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from:
          process.env.ALERTS_FROM_EMAIL ||
          "The Florida Havens <alerts@thefloridahavens.com>",
        to,
        subject,
        text,
      }),
      signal: AbortSignal.timeout(8000),
    });
    return res.ok ? { ok: true } : { ok: false, reason: `resend-${res.status}` };
  } catch {
    return { ok: false, reason: "resend-network" };
  }
}

async function sendSms(to: string, body: string): Promise<SendResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!sid || !token || !from) return { ok: false, reason: "no-provider" };
  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization:
            "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"),
          "content-type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ To: to, From: from, Body: body }),
        signal: AbortSignal.timeout(8000),
      }
    );
    return res.ok ? { ok: true } : { ok: false, reason: `twilio-${res.status}` };
  } catch {
    return { ok: false, reason: "twilio-network" };
  }
}

/* ── The run ────────────────────────────────────────────────────────── */

export type AlertRunSummary = {
  launches: number;
  due: { launch: string; kind: Kind; net: string }[];
  recipients: number;
  sent: number;
  skipped: Record<string, number>;
  errors: number;
  providers: { email: boolean; sms: boolean };
  dryRun: boolean;
};

interface RecipientRow {
  id: string;
  email: string;
  phone: string | null;
  reservation_id: string | null;
  unsubscribed_at?: string | null;
}

interface StayRow {
  id: string;
  guest_first_name: string | null;
  check_out: string;
  property_id: string;
  properties: { name: string } | { name: string }[] | null;
}

/** Compute which alerts are due and send them. `dryRun` plans without
 *  sending or logging. Windows are wider than the cron period on purpose —
 *  the unique log index is what prevents double-sends. */
export async function runLaunchAlerts(
  base: string,
  dryRun = false
): Promise<AlertRunSummary> {
  const providers = providerStatus();
  const summary: AlertRunSummary = {
    launches: 0,
    due: [],
    recipients: 0,
    sent: 0,
    skipped: {},
    errors: 0,
    providers,
    dryRun,
  };
  const skip = (reason: string, n = 1) => {
    summary.skipped[reason] = (summary.skipped[reason] ?? 0) + n;
  };

  const db = supabaseAdmin();
  if (!db) {
    skip("no-db");
    return summary;
  }

  const launches = (await fetchUpcomingLaunches()) ?? [];
  summary.launches = launches.length;
  const now = Date.now();
  const byKey = new Map(launches.map((l) => [slug(l.name), l]));

  // In-house stays with a linked, live subscriber.
  const nowIso = new Date(now).toISOString();
  const { data: stays } = await db
    .from("reservations")
    .select("id, guest_first_name, check_out, property_id, properties (name)")
    .neq("status", "checked_out")
    .lte("check_in", nowIso)
    .gte("check_out", nowIso);
  const stayById = new Map((stays as StayRow[] | null)?.map((s) => [s.id, s]));

  const { data: subs } = await db
    .from("guest_subscribers")
    .select("id, email, phone, reservation_id, unsubscribed_at")
    .in("reservation_id", [...stayById.keys()]);
  const recipients = ((subs as RecipientRow[] | null) ?? []).filter(
    (s) => !s.unsubscribed_at && s.reservation_id
  );
  summary.recipients = recipients.length;

  // Which (launch, kind) pairs are due right now?
  const due: { launch: UpcomingLaunch; kind: Kind; key: string }[] = [];
  for (const l of launches) {
    const dt = new Date(l.net).getTime() - now;
    if (dt > 20 * 3600_000 && dt <= 26 * 3600_000)
      due.push({ launch: l, kind: "t24", key: slug(l.name) });
    if (dt > 0.5 * 3600_000 && dt <= 1.5 * 3600_000)
      due.push({ launch: l, kind: "t1", key: slug(l.name) });
  }

  // Slip / scrub detection against what we already told guests.
  const { data: prior } = await db
    .from("launch_alerts")
    .select("subscriber_id, launch_key, kind, net")
    .in("kind", ["t24", "t1"])
    .eq("status", "sent")
    .gte("created_at", new Date(now - 7 * 86400_000).toISOString());
  const priorByKey = new Map<string, string>(); // launch_key -> net at send
  for (const p of prior ?? []) {
    if (p.net && !priorByKey.has(p.launch_key)) priorByKey.set(p.launch_key, p.net);
  }
  for (const [key, sentNet] of priorByKey) {
    const current = byKey.get(key);
    const sentAt = new Date(sentNet).getTime();
    if (!current) {
      // Alerted launch no longer upcoming and its window hasn't passed →
      // treat as scrubbed. (If it launched, net is in the past — silent.)
      if (sentAt > now)
        due.push({
          launch: { name: key, vehicle: null, provider: null, net: sentNet, status: "Scrubbed" },
          kind: "scrub",
          key,
        });
    } else if (Math.abs(new Date(current.net).getTime() - sentAt) >= 45 * 60_000) {
      due.push({ launch: current, kind: "delay", key });
    }
  }
  summary.due = due.map((d) => ({ launch: d.launch.name, kind: d.kind, net: d.launch.net }));

  if (dryRun || due.length === 0 || recipients.length === 0) return summary;

  const quiet = inQuietHours(new Date(now));

  for (const d of due) {
    for (const r of recipients) {
      const stay = stayById.get(r.reservation_id!);
      if (!stay) continue;
      const prop = Array.isArray(stay.properties)
        ? stay.properties[0]
        : stay.properties;
      const portal = await ensureGuestToken(stay.id, stay.check_out)
        .then((t) => t?.url ?? null)
        .catch(() => null);
      const vars: Vars = {
        guest_first_name: stay.guest_first_name || "there",
        property_name: signageName(prop?.name ?? "your Haven"),
        launch_name: d.launch.name,
        net_local: netLocal(d.launch.net),
        new_net_local: netLocal(d.launch.net),
        status: d.launch.status ?? "TBD",
        portal_url: portal ?? "https://www.thefloridahavens.com",
        unsubscribe_url: unsubscribeUrl(r.email, base),
      };

      const attempts: { channel: Channel; to: string }[] = [
        { channel: "email", to: r.email },
      ];
      if (r.phone) attempts.push({ channel: "sms", to: r.phone });

      for (const a of attempts) {
        // Claim the (subscriber, launch, kind, channel) slot first — on
        // conflict the alert was already handled by an earlier run.
        const { data: claimed } = await db
          .from("launch_alerts")
          .upsert(
            {
              subscriber_id: r.id,
              launch_key: d.key,
              kind: d.kind,
              channel: a.channel,
              status: "pending",
              net: d.launch.net,
            },
            {
              onConflict: "subscriber_id,launch_key,kind,channel",
              ignoreDuplicates: true,
            }
          )
          .select("id");
        const claimId = claimed?.[0]?.id;
        if (!claimId) {
          skip("already-sent");
          continue;
        }
        const finish = (status: string) =>
          db.from("launch_alerts").update({ status }).eq("id", claimId);

        if (a.channel === "sms" && quiet) {
          await finish("skipped:quiet-hours");
          skip("quiet-hours");
          continue;
        }
        const result =
          a.channel === "email"
            ? await sendEmail(
                a.to,
                fill(EMAIL_SUBJECT[d.kind], vars),
                fill(EMAIL_BODY[d.kind], vars)
              )
            : await sendSms(a.to, fill(SMS[d.kind], vars));
        if (result.ok) {
          await finish("sent");
          summary.sent++;
        } else if (result.reason === "no-provider") {
          await finish("skipped:no-provider");
          skip("no-provider");
        } else {
          await finish(`error:${result.reason}`);
          summary.errors++;
        }
      }
    }
  }
  return summary;
}
