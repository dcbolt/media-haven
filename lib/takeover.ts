/**
 * S1.3b emergency / storm takeover (Rise Vision–inspired).
 *
 * Fleet-wide pin on Tenant Zero org settings so every FH TV shows the same
 * full-bleed message until TTL or host clear. Higher priority than playlists
 * / vacant slideshow — the TV client short-circuits to this slide only.
 *
 * Shape lives on orgs.settings.emergencyTakeover (no migration).
 */

import { FLORIDA_HAVENS_ORG_ID } from "./org";
import { supabaseAdmin } from "./supabase";

export type TakeoverKind = "storm" | "water" | "custom";

export type EmergencyTakeover = {
  kind: TakeoverKind;
  title: string;
  body: string;
  /** ISO datetime — after this, takeover is ignored (auto-clear). */
  until: string;
  setAt: string;
};

const MAX_TITLE = 80;
const MAX_BODY = 600;
const MIN_TTL_MS = 5 * 60_000; // 5 min
const MAX_TTL_MS = 48 * 60 * 60_000; // 48 h

const PRESETS: Record<
  Exclude<TakeoverKind, "custom">,
  { title: string; body: string }
> = {
  storm: {
    title: "Weather alert",
    body: "A storm or severe weather is in the area. Stay indoors, keep away from windows, and follow local emergency guidance. Check your phone for county alerts. Host will clear this message when it is safe.",
  },
  water: {
    title: "Water advisory",
    body: "Please do not drink or cook with tap water until further notice. Use bottled water. We will update you as soon as the advisory is lifted.",
  },
};

export function sanitizeTakeover(raw: unknown): EmergencyTakeover | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const kindRaw = String(o.kind ?? "custom");
  const kind: TakeoverKind =
    kindRaw === "storm" || kindRaw === "water" || kindRaw === "custom"
      ? kindRaw
      : "custom";
  const title = String(o.title ?? "")
    .trim()
    .slice(0, MAX_TITLE);
  const body = String(o.body ?? "")
    .trim()
    .slice(0, MAX_BODY);
  const until = String(o.until ?? "").trim();
  const setAt = String(o.setAt ?? "").trim();
  if (!title || !body) return null;
  if (!Number.isFinite(Date.parse(until))) return null;
  if (!Number.isFinite(Date.parse(setAt))) return null;
  return { kind, title, body, until, setAt };
}

/** Active if present and until is still in the future. */
export function activeTakeover(
  raw: unknown,
  now = Date.now()
): EmergencyTakeover | null {
  const t = sanitizeTakeover(raw);
  if (!t) return null;
  if (Date.parse(t.until) <= now) return null;
  return t;
}

export async function loadEmergencyTakeover(
  orgId: string = FLORIDA_HAVENS_ORG_ID
): Promise<EmergencyTakeover | null> {
  const db = supabaseAdmin();
  if (!db) return null;
  const { data, error } = await db
    .from("orgs")
    .select("settings")
    .eq("id", orgId)
    .maybeSingle();
  if (error || !data) return null;
  const settings =
    data.settings && typeof data.settings === "object"
      ? (data.settings as Record<string, unknown>)
      : {};
  return activeTakeover(settings.emergencyTakeover);
}

export async function setEmergencyTakeover(
  input: {
    kind: TakeoverKind;
    title?: string;
    body?: string;
    /** Minutes from now (default 6h storm / 12h water). */
    ttlMinutes?: number;
  },
  orgId: string = FLORIDA_HAVENS_ORG_ID
): Promise<
  { ok: true; takeover: EmergencyTakeover } | { ok: false; error: string }
> {
  const db = supabaseAdmin();
  if (!db) return { ok: false, error: "no database" };

  const preset =
    input.kind === "custom" ? null : PRESETS[input.kind] ?? PRESETS.storm;
  const title = (input.title?.trim() || preset?.title || "Notice").slice(
    0,
    MAX_TITLE
  );
  const body = (input.body?.trim() || preset?.body || "").slice(0, MAX_BODY);
  if (!body) return { ok: false, error: "body required" };

  const defaultMin = input.kind === "water" ? 12 * 60 : 6 * 60;
  let ttlMs = (Number(input.ttlMinutes) || defaultMin) * 60_000;
  if (!Number.isFinite(ttlMs)) ttlMs = defaultMin * 60_000;
  ttlMs = Math.min(MAX_TTL_MS, Math.max(MIN_TTL_MS, ttlMs));

  const now = Date.now();
  const takeover: EmergencyTakeover = {
    kind: input.kind,
    title,
    body,
    until: new Date(now + ttlMs).toISOString(),
    setAt: new Date(now).toISOString(),
  };

  const { data: row, error: readErr } = await db
    .from("orgs")
    .select("settings")
    .eq("id", orgId)
    .maybeSingle();
  if (readErr) return { ok: false, error: readErr.message };
  if (!row) return { ok: false, error: "org missing — apply 0019" };

  const prev =
    row.settings && typeof row.settings === "object"
      ? (row.settings as Record<string, unknown>)
      : {};
  const { error: writeErr } = await db
    .from("orgs")
    .update({
      settings: { ...prev, emergencyTakeover: takeover },
    })
    .eq("id", orgId);
  if (writeErr) return { ok: false, error: writeErr.message };
  return { ok: true, takeover };
}

export async function clearEmergencyTakeover(
  orgId: string = FLORIDA_HAVENS_ORG_ID
): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = supabaseAdmin();
  if (!db) return { ok: false, error: "no database" };

  const { data: row, error: readErr } = await db
    .from("orgs")
    .select("settings")
    .eq("id", orgId)
    .maybeSingle();
  if (readErr) return { ok: false, error: readErr.message };
  if (!row) return { ok: false, error: "org missing" };

  const prev =
    row.settings && typeof row.settings === "object"
      ? (row.settings as Record<string, unknown>)
      : {};
  const next = { ...prev };
  delete next.emergencyTakeover;
  const { error: writeErr } = await db
    .from("orgs")
    .update({ settings: next })
    .eq("id", orgId);
  if (writeErr) return { ok: false, error: writeErr.message };
  return { ok: true };
}
