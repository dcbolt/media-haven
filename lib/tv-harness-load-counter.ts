/**
 * Smoke harness /tv document load counting (F-956 / F-970) — Node-safe.
 * Constants live here so Node smokes never chain extensionless imports (F-988).
 */

export const TV_DOC_LOAD_COOKIE = "fh_tv_doc_loads";
export const TV_DOC_LOAD_HEADER = "x-fh-tv-load-count";

/** Disabled on Vercel production guest deploys; CI and preview keep the harness. */
export function tvHarnessLoadCounterEnabled(): boolean {
  return process.env.VERCEL_ENV !== "production";
}

export type TvDocLoadCounterInput = {
  pathname: string;
  reset: boolean;
  isDocument: boolean;
  previousCount: number;
  harnessEnabled: boolean;
};

export function nextTvDocLoadCount(input: TvDocLoadCounterInput): {
  count: number;
  setCookie: boolean;
  setHeader: boolean;
} {
  if (input.pathname !== "/tv" || !input.harnessEnabled) {
    return { count: input.previousCount, setCookie: false, setHeader: false };
  }
  let count = 0;
  if (input.reset) {
    count = 0;
  } else {
    count = input.previousCount;
    if (input.isDocument) count += 1;
  }
  return { count, setCookie: true, setHeader: true };
}
