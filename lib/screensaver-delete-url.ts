/**
 * Strict URL guards before deleting listed screensaver uploads.
 */

import { getSupabaseProjectHost } from "./supabase-project-url.ts";
import { storagePathFromAllowedPublicUrl } from "./supabase-screensaver-upload-enforce.ts";
import { isProtectedStandbyScreensaverUrl } from "./screensaver-standby.ts";

const SCREENSAVER_PATH_MARKER = "/screensavers/";

/** Suffix allowlist for Vercel Blob public URLs (no host.includes). */
const BLOB_HOST_SUFFIXES = [
  "public.blob.vercel-storage.com",
  "blob.vercel-storage.com",
] as const;

export type ScreensaverDeleteUrlRejectCode =
  | "not_https"
  | "bad_host"
  | "bad_path"
  | "not_upload_source"
  | "protected_standby";

export function hostnameMatchesSuffix(
  hostname: string,
  suffix: string
): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, "");
  const s = suffix.toLowerCase().replace(/\.$/, "");
  return h === s || h.endsWith(`.${s}`);
}

function hostnameAllowedForBlob(hostname: string): boolean {
  return BLOB_HOST_SUFFIXES.some((s) => hostnameMatchesSuffix(hostname, s));
}

export function parseStrictHttpsUrl(
  url: string
): { ok: true; parsed: URL } | { ok: false; code: ScreensaverDeleteUrlRejectCode } {
  if (typeof url !== "string" || url.length > 2000) {
    return { ok: false, code: "not_https" };
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, code: "not_https" };
  }
  if (parsed.protocol !== "https:") {
    return { ok: false, code: "not_https" };
  }
  if (parsed.username || parsed.password) {
    return { ok: false, code: "bad_host" };
  }
  return { ok: true, parsed };
}

export function blobScreensaverPathOk(pathname: string): boolean {
  if (!pathname.includes(SCREENSAVER_PATH_MARKER)) return false;
  if (pathname.includes("..")) return false;
  const idx = pathname.indexOf(SCREENSAVER_PATH_MARKER);
  const after = pathname.slice(idx + SCREENSAVER_PATH_MARKER.length);
  if (!after || after.startsWith("/")) return false;
  return true;
}

export function classifyScreensaverDeleteStorage(
  url: string
): "blob" | "supabase" | null {
  const parsed = parseStrictHttpsUrl(url);
  if (!parsed.ok) return null;

  const supabasePath = storagePathFromAllowedPublicUrl(url);
  if (supabasePath) {
    if (supabasePath.includes("..")) return null;
    return "supabase";
  }

  const host = parsed.parsed.hostname;
  if (!hostnameAllowedForBlob(host)) return null;
  if (!blobScreensaverPathOk(parsed.parsed.pathname)) return null;
  return "blob";
}

export function validateScreensaverDeleteUrlShape(
  url: string
): { ok: true; storage: "blob" | "supabase" } | { ok: false; code: ScreensaverDeleteUrlRejectCode } {
  if (isProtectedStandbyScreensaverUrl(url)) {
    return { ok: false, code: "protected_standby" };
  }
  const storage = classifyScreensaverDeleteStorage(url);
  if (!storage) {
    const parsed = parseStrictHttpsUrl(url);
    if (!parsed.ok) return { ok: false, code: parsed.code };
    return { ok: false, code: "not_upload_source" };
  }
  return { ok: true, storage };
}

/** Evil lookalike: e.g. not-the-real.public.blob.vercel-storage.com.evil.com */
export function isBlobLookalikeHost(hostname: string): boolean {
  const allowed = hostnameAllowedForBlob(hostname);
  if (allowed) return false;
  return /blob\.vercel-storage\.com/i.test(hostname);
}

export function supabaseScreensaverHostOk(hostname: string): boolean {
  const allowed = getSupabaseProjectHost();
  if (!allowed) return false;
  return hostnameMatchesSuffix(hostname, allowed);
}
