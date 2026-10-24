/**
 * Smoke-only persistent crash into app/tv/error.tsx (?__tv_crash=1).
 * Disabled on production guest deploys (F-962).
 */

export function tvSyntheticCrashFromQuery(search: string): boolean {
  if (new URLSearchParams(search).get("__tv_crash") !== "1") return false;
  return tvSyntheticCrashHarnessAllowed();
}

/** Client-only: call after confirming the query flag. */
export function tvSyntheticCrashHarnessAllowed(): boolean {
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1") return true;
  }
  if (process.env.NODE_ENV !== "production") return true;
  const vercelEnv = process.env.NEXT_PUBLIC_VERCEL_ENV;
  return vercelEnv === "preview" || vercelEnv === "development";
}
