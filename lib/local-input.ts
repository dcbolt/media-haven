/**
 * Per-TV "Allow local input" (guest may switch to their own HDMI device).
 *
 * Portal side stores INTENT only, in orgs.settings.localInput[kioskId]
 * (no migration, same CAS pattern as lib/fleet-reload.ts). The on-site node
 * polls outbound, applies the pause locally (kiosk pausedUntil) and reports
 * state back. The portal never reaches into the node; the node exposes no
 * inbound port to the internet.
 *
 * Kiosk ids are a fixed allowlist (Dunes only). Unknown ids are rejected.
 */
import { FLORIDA_HAVENS_ORG_ID } from "./org";
import { patchOrgSettingsMutate } from "./org-settings-cas";
import { supabaseAdmin } from "./supabase";

export const DUNES_KIOSK_IDS = [
  "br1", "br2", "br3", "br4", "lr", "rr",
  "sh_lr", "sh_br1", "sh_br2", "sh_br3",
] as const;
export type KioskId = (typeof DUNES_KIOSK_IDS)[number];

export const MAX_UNLOCK_MS = 21 * 24 * 3600_000; // hard cap, 21 days
const AUDIT_CAP = 50;

export type LocalInputIntent = {
  /** ISO. TV is unlocked (watcher skips it) until this time. Absent = locked. */
  unlockUntil?: string;
  /** one-shot: node sends ECP InputHDMI2 once, then clears. */
  switchHdmi2At?: string;
  by: string;
  at: string;
};
export type LocalInputReport = {
  paused: boolean;
  pausedUntil: string | null;
  input: string | null; // e.g. "hdmi2" | "signage" | "streaming:<app>" | "unknown"
  reportedAt: string;
};
export type AuditEntry = { at: string; by: string; kiosk: string; action: string; until?: string };

export function isKioskId(v: unknown): v is KioskId {
  return typeof v === "string" && (DUNES_KIOSK_IDS as readonly string[]).includes(v);
}

/** Clamp an unlock end: default = stay.checkOut, never past MAX_UNLOCK_MS, never in the past. */
export function resolveUnlockUntil(
  opts: { checkOutIso?: string | null; minutes?: number | null },
  now = Date.now()
): { ok: true; until: string } | { ok: false; error: string } {
  let end: number;
  if (opts.minutes != null) {
    if (!Number.isFinite(opts.minutes) || opts.minutes <= 0) return { ok: false, error: "bad minutes" };
    end = now + opts.minutes * 60_000;
  } else if (opts.checkOutIso && Number.isFinite(Date.parse(opts.checkOutIso))) {
    end = Date.parse(opts.checkOutIso);
  } else {
    return { ok: false, error: "no checkout time; give minutes" };
  }
  if (end <= now) return { ok: false, error: "end is in the past" };
  end = Math.min(end, now + MAX_UNLOCK_MS);
  return { ok: true, until: new Date(end).toISOString() };
}

type Settings = Record<string, unknown>;
function map(raw: unknown): Record<string, LocalInputIntent> {
  const out: Record<string, LocalInputIntent> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw as Record<string, LocalInputIntent>)) if (isKioskId(k) && v) out[k] = v;
  return out;
}

export async function readLocalInput(orgId = FLORIDA_HAVENS_ORG_ID) {
  const db = supabaseAdmin();
  if (!db) return { intents: {}, reports: {}, audit: [] as AuditEntry[] };
  const { data } = await db.from("orgs").select("settings").eq("id", orgId).maybeSingle();
  const s = (data?.settings && typeof data.settings === "object" ? data.settings : {}) as Settings;
  return {
    intents: map(s.localInput),
    reports: (s.localInputReports ?? {}) as Record<string, LocalInputReport>,
    audit: (Array.isArray(s.localInputAudit) ? s.localInputAudit : []) as AuditEntry[],
  };
}

export async function setLocalInput(
  input: { kiosk: string; action: "unlock" | "lock"; until?: string; switchHdmi2?: boolean; by: string },
  orgId = FLORIDA_HAVENS_ORG_ID
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isKioskId(input.kiosk)) return { ok: false, error: "unknown kiosk" };
  const db = supabaseAdmin();
  if (!db) return { ok: false, error: "no database" };
  const at = new Date().toISOString();
  const r = await patchOrgSettingsMutate(
    orgId,
    (prev) => {
      const m = map(prev.localInput);
      if (input.action === "lock") m[input.kiosk] = { by: input.by, at };
      else m[input.kiosk] = {
        unlockUntil: input.until, by: input.by, at,
        ...(input.switchHdmi2 ? { switchHdmi2At: at } : {}),
      };
      const audit = [
        ...(Array.isArray(prev.localInputAudit) ? (prev.localInputAudit as AuditEntry[]) : []),
        { at, by: input.by, kiosk: input.kiosk, action: input.action + (input.switchHdmi2 ? "+hdmi2" : ""), until: input.until },
      ].slice(-AUDIT_CAP);
      return { ...prev, localInput: m, localInputAudit: audit };
    },
    db
  );
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}

/** Node ack/report: store last report per kiosk; clear one-shot hdmi2 flag when acked. */
export async function recordNodeReport(
  reports: Record<string, Omit<LocalInputReport, "reportedAt"> & { ackedHdmi2?: boolean }>,
  orgId = FLORIDA_HAVENS_ORG_ID
): Promise<{ ok: boolean; error?: string }> {
  const db = supabaseAdmin();
  if (!db) return { ok: false, error: "no database" };
  const now = new Date().toISOString();
  const r = await patchOrgSettingsMutate(
    orgId,
    (prev) => {
      const rep = { ...((prev.localInputReports ?? {}) as Record<string, LocalInputReport>) };
      const m = map(prev.localInput);
      for (const [k, v] of Object.entries(reports)) {
        if (!isKioskId(k)) continue;
        rep[k] = { paused: !!v.paused, pausedUntil: v.pausedUntil ?? null, input: v.input ? String(v.input).slice(0, 40) : null, reportedAt: now };
        if (v.ackedHdmi2 && m[k]) { const { switchHdmi2At: _x, ...rest } = m[k]; m[k] = rest; }
      }
      return { ...prev, localInputReports: rep, localInput: m };
    },
    db
  );
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}
