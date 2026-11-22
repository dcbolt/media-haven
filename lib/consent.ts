import { createHash } from "crypto";
import { supabaseAdmin } from "./supabase";

/** Bump when checkbox copy changes (stored on every row). */
export const GUIDE_SIGNUP_CONSENT_VERSION = "2026-11-22-guide-v1";
export const WIFI_PORTAL_CONSENT_VERSION = "2026-11-22-wifi-v1";

export function hashEmail(email: string): string {
  const norm = email.trim().toLowerCase();
  return createHash("sha256").update(norm, "utf8").digest("hex");
}

export type ConsentSource = "guide-signup" | "wifi-captive";

export async function recordConsentLog(input: {
  email: string;
  property: string | null;
  source: ConsentSource;
  consentedMarketing: boolean;
  consentTextVersion: string;
  /** When true, omit plaintext email (Wi-Fi transactional-only path). */
  emailRedacted?: boolean;
}): Promise<{ ok: boolean; demo?: boolean }> {
  const db = supabaseAdmin();
  if (!db) return { ok: true, demo: true };

  const email_hash = hashEmail(input.email);
  const row = {
    email_hash,
    email: input.emailRedacted ? null : input.email.trim().toLowerCase(),
    property: input.property,
    source: input.source,
    consented_marketing: input.consentedMarketing,
    consent_text_version: input.consentTextVersion,
  };
  const { error } = await db.from("consent_log").insert(row);
  return error ? { ok: false } : { ok: true };
}