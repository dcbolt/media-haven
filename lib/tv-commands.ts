/**
 * Path C — portal “Open on TV” command queue.
 * Spec: docs/PATH-C-TV-LAUNCH.md (Claude ACK 2026-07-20).
 *
 * - Guest token scopes enqueue to in-house reservation property only.
 * - TV state poll claims at-most-once (single-winner UPDATE).
 * - TV POSTs done/failed fire-and-forget; TTL covers lost acks.
 * - Never stores stream credentials — packages from STREAMING_SERVICES only.
 */

import { STREAMING_SERVICES, appLaunchUrl } from "./streaming";
import { supabaseAdmin } from "./supabase";
import { FLORIDA_HAVENS_ORG_ID } from "./org";

const TTL_MS = 60_000;
const RATE_WINDOW_MS = 10 * 60_000;
const RATE_MAX = 5;
const ONLINE_MS = 2 * 60_000;

export type TvCommandStatus =
  | "pending"
  | "claimed"
  | "done"
  | "expired"
  | "failed";

export type PendingCommand = {
  id: string;
  action: "launch_app";
  slug: string;
  androidPackage: string;
  launchUrl: string;
};

export type OnlineTv = {
  id: string;
  label: string | null;
  lastSeen: string;
};

function serviceBySlug(slug: string) {
  return STREAMING_SERVICES.find((s) => s.slug === slug) ?? null;
}

/** Mark stale pending rows expired (best-effort; claim also checks TTL). */
export async function expireStaleCommands(propertyId: string): Promise<void> {
  const db = supabaseAdmin();
  if (!db) return;
  await db
    .from("tv_commands")
    .update({ status: "expired" })
    .eq("property_id", propertyId)
    .eq("status", "pending")
    .lt("expires_at", new Date().toISOString());
}

/** Online TVs on a property (last_seen within 2 min). */
export async function listOnlineTvs(
  propertyId: string
): Promise<OnlineTv[]> {
  const db = supabaseAdmin();
  if (!db) return [];
  const since = new Date(Date.now() - ONLINE_MS).toISOString();
  const { data } = await db
    .from("tv_devices")
    .select("id, label, last_seen")
    .eq("property_id", propertyId)
    .gte("last_seen", since)
    .order("label", { ascending: true });
  return (data ?? []).map((r) => ({
    id: r.id as string,
    label: (r.label as string | null) ?? null,
    lastSeen: r.last_seen as string,
  }));
}

export type EnqueueResult =
  | {
      ok: true;
      commandId: string;
      expiresAt: string;
      targetHint: string;
    }
  | { ok: false; status: number; error: string };

/**
 * Enqueue a launch_app command for a property.
 * Caller must have already resolved guest token → in-house reservation.
 */
export async function enqueueLaunchCommand(opts: {
  orgId: string;
  propertyId: string;
  slug: string;
  tvDeviceId?: string | null;
}): Promise<EnqueueResult> {
  const db = supabaseAdmin();
  if (!db) return { ok: false, status: 503, error: "database unavailable" };

  const svc = serviceBySlug(opts.slug);
  if (!svc) return { ok: false, status: 400, error: "unknown streaming service" };

  await expireStaleCommands(opts.propertyId);

  const online = await listOnlineTvs(opts.propertyId);
  if (online.length === 0) {
    return { ok: false, status: 404, error: "no TV online" };
  }

  let targetId = opts.tvDeviceId ?? null;
  if (online.length > 1 && !targetId) {
    return {
      ok: false,
      status: 400,
      error: "multiple TVs online — pick a device",
    };
  }
  if (targetId && !online.some((t) => t.id === targetId)) {
    return { ok: false, status: 404, error: "target TV not online" };
  }
  if (!targetId && online.length === 1) {
    targetId = online[0].id;
  }

  const windowStart = new Date(Date.now() - RATE_WINDOW_MS).toISOString();
  const { count } = await db
    .from("tv_commands")
    .select("id", { count: "exact", head: true })
    .eq("property_id", opts.propertyId)
    .gte("created_at", windowStart);
  if ((count ?? 0) >= RATE_MAX) {
    return { ok: false, status: 409, error: "rate limit — try again later" };
  }

  const expiresAt = new Date(Date.now() + TTL_MS).toISOString();
  const orgId = opts.orgId || FLORIDA_HAVENS_ORG_ID;

  const { data, error } = await db
    .from("tv_commands")
    .insert({
      org_id: orgId,
      property_id: opts.propertyId,
      tv_device_id: targetId,
      action: "launch_app",
      payload: {
        slug: svc.slug,
        androidPackage: svc.androidPackage,
      },
      status: "pending",
      expires_at: expiresAt,
    })
    .select("id, expires_at")
    .single();

  if (error || !data) {
    return {
      ok: false,
      status: 500,
      error: error?.message ?? "insert failed",
    };
  }

  const target = online.find((t) => t.id === targetId) ?? online[0];
  const targetHint = target.label?.trim() || "Living Room TV";

  return {
    ok: true,
    commandId: data.id as string,
    expiresAt: data.expires_at as string,
    targetHint,
  };
}

/**
 * Claim one pending command for this device (at-most-once).
 * Called from TV state poll path only.
 */
export async function claimPendingCommand(opts: {
  propertyId: string;
  deviceId: string;
}): Promise<PendingCommand | null> {
  const db = supabaseAdmin();
  if (!db) return null;

  await expireStaleCommands(opts.propertyId);

  const now = new Date().toISOString();
  // Prefer explicit target, else untargeted (null) pending rows.
  const { data: candidates } = await db
    .from("tv_commands")
    .select("id, payload, action, tv_device_id")
    .eq("property_id", opts.propertyId)
    .eq("status", "pending")
    .gt("expires_at", now)
    .or(`tv_device_id.eq.${opts.deviceId},tv_device_id.is.null`)
    .order("created_at", { ascending: true })
    .limit(5);

  if (!candidates?.length) return null;

  for (const row of candidates) {
    const { data: claimed, error } = await db
      .from("tv_commands")
      .update({
        status: "claimed",
        claimed_at: now,
        claimed_by_device_id: opts.deviceId,
      })
      .eq("id", row.id)
      .eq("status", "pending")
      .gt("expires_at", now)
      .select("id, payload, action")
      .maybeSingle();

    if (error || !claimed) continue;

    const payload = (claimed.payload ?? {}) as {
      slug?: string;
      androidPackage?: string;
    };
    const slug = payload.slug ?? "";
    const androidPackage =
      payload.androidPackage ||
      serviceBySlug(slug)?.androidPackage ||
      "";
    if (!androidPackage) {
      await db
        .from("tv_commands")
        .update({
          status: "failed",
          error: "missing android package",
          completed_at: new Date().toISOString(),
        })
        .eq("id", claimed.id);
      continue;
    }

    return {
      id: claimed.id as string,
      action: "launch_app",
      slug,
      androidPackage,
      launchUrl: appLaunchUrl(androidPackage),
    };
  }

  return null;
}

export async function completeCommand(
  commandId: string,
  opts: { status: "done" | "failed"; error?: string; deviceId?: string }
): Promise<boolean> {
  const db = supabaseAdmin();
  if (!db) return false;

  const patch: Record<string, unknown> = {
    status: opts.status,
    completed_at: new Date().toISOString(),
  };
  if (opts.status === "failed" && opts.error) {
    patch.error = opts.error.slice(0, 500);
  }

  let q = db
    .from("tv_commands")
    .update(patch)
    .eq("id", commandId)
    .in("status", ["claimed", "pending"]);

  if (opts.deviceId) {
    q = q.or(
      `claimed_by_device_id.eq.${opts.deviceId},claimed_by_device_id.is.null`
    );
  }

  const { error } = await q;
  return !error;
}

/**
 * Resolve guest token → property_id + org_id for command authz.
 * Demo token returns null (no real TV to drive).
 */
export async function resolveGuestCommandContext(token: string): Promise<{
  propertyId: string;
  orgId: string;
  propertyName: string;
} | null> {
  if (!token || token === "demo") return null;
  const db = supabaseAdmin();
  if (!db) return null;

  const now = new Date().toISOString();
  const { data } = await db
    .from("guest_tokens")
    .select(
      `expires_at,
       reservations (
         check_in, check_out, status,
         properties ( id, name, org_id )
       )`
    )
    .eq("token", token)
    .maybeSingle();

  if (!data || new Date(data.expires_at) < new Date()) return null;

  const reservation = Array.isArray(data.reservations)
    ? data.reservations[0]
    : data.reservations;
  if (!reservation) return null;
  if (reservation.status === "checked_out") return null;
  // In-house only (vacant TV = no launch)
  if (reservation.check_in > now || reservation.check_out < now) return null;

  const property = Array.isArray(reservation.properties)
    ? reservation.properties[0]
    : reservation.properties;
  if (!property?.id) return null;

  return {
    propertyId: property.id as string,
    orgId: (property.org_id as string) || FLORIDA_HAVENS_ORG_ID,
    propertyName: (property.name as string) || "Home",
  };
}
