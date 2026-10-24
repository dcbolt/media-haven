/**
 * Smoke-only /tv document load counter (F-956 / F-970) — no browser imports.
 */

export const TV_DOC_LOAD_COOKIE = "fh_tv_doc_loads";
export const TV_DOC_LOAD_HEADER = "x-fh-tv-load-count";

/** Disabled on Vercel production guest deploys; CI and preview keep the harness. */
export function tvHarnessLoadCounterEnabled(): boolean {
  return process.env.VERCEL_ENV !== "production";
}
