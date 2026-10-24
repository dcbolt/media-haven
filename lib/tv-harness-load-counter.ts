/**
 * Smoke harness /tv document load counting (F-956 / F-970) — Node-safe.
 */

import { TV_DOC_LOAD_COOKIE } from "./tv-harness-middleware";

export { TV_DOC_LOAD_COOKIE, TV_DOC_LOAD_HEADER } from "./tv-harness-middleware";

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
