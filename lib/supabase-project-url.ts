/**
 * Resolve Supabase project host from env (F-1009) — no hard-coded tenant host.
 */

let loggedMissing = false;
let loggedInvalid = false;

/** Lowercase hostname, no trailing dots (F-1021). */
export function normalizeSupabaseHost(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/\.+$/, "");
}

/** Hostname from NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL; null if unset/invalid. */
export function getSupabaseProjectHost(): string | null {
  const raw =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    process.env.SUPABASE_URL?.trim() ||
    "";
  if (!raw) {
    if (!loggedMissing) {
      loggedMissing = true;
      console.error("[media-upload]", {
        result: "supabase_project_url_missing",
        message:
          "Set NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL — storage URL allowlist is off until configured",
      });
    }
    return null;
  }
  try {
    return normalizeSupabaseHost(new URL(raw).hostname);
  } catch {
    if (!loggedInvalid) {
      loggedInvalid = true;
      console.error("[media-upload]", {
        result: "supabase_project_url_invalid",
        value: raw.slice(0, 120),
      });
    }
    return null;
  }
}

/** @deprecated use getSupabaseProjectHost() */
export function getSupabaseStoragePublicHost(): string | null {
  return getSupabaseProjectHost();
}
