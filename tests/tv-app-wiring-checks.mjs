/**
 * App wiring guards for TV self-reload + global-error retry (F-979 / F-986 / F-989).
 * Comment-stripped source + behavioural shapes (regex alone is fooled by comments).
 */

/** Remove line and block comments (strings preserved). */
export function stripJsComments(src) {
  let out = "";
  let i = 0;
  while (i < src.length) {
    if (src[i] === "/" && src[i + 1] === "/") {
      while (i < src.length && src[i] !== "\n") i++;
      continue;
    }
    if (src[i] === "/" && src[i + 1] === "*") {
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    if (src[i] === "'" || src[i] === '"' || src[i] === "`") {
      const q = src[i];
      out += src[i++];
      while (i < src.length && src[i] !== q) {
        if (src[i] === "\\" && i + 1 < src.length) out += src[i++];
        if (i < src.length) out += src[i++];
      }
      if (i < src.length) out += src[i++];
      continue;
    }
    out += src[i++];
  }
  return out;
}

function activeSource(raw) {
  return typeof raw === "string" && raw.length > 0 ? stripJsComments(raw) : "";
}

/** Regex guard on comment-stripped /tv page source. */
export function selfReloadWiringOk(rawSrc) {
  const src = activeSource(rawSrc);
  return (
    src.length > 0 &&
    /\bmsUntilNextSelfHealTimer\s*\(/.test(src) &&
    /\btvSelfHealScheduleDeps\b/.test(src) &&
    /\bshouldAttemptNightlyReload\s*\(/.test(src) &&
    /\bmarkNightlyReloadAttempted\s*\(/.test(src) &&
    /\bclearPersistedSelfHealTarget\s*\(/.test(src) &&
    /\breloadTvIfReachable\s*\([\s\S]*kind:\s*["']budgeted["']/.test(src) &&
    /\barmNextTimer\s*\(/.test(src)
  );
}

/** Behavioural: self-heal effect arms timer on mount (not only after reload). */
export function selfReloadAppBehaviorOk(rawSrc) {
  const src = activeSource(rawSrc);
  if (!selfReloadWiringOk(src)) return false;
  const armStart = src.indexOf("const armNextTimer");
  const attemptStart = src.indexOf("const attemptScheduledReload");
  if (armStart < 0 || attemptStart < 0 || attemptStart <= armStart) return false;
  const armRegion = src.slice(armStart, attemptStart);
  if (!/\bmsUntilNextSelfHealTimer\s*\(/.test(armRegion)) return false;
  const afterAttempt = src.slice(attemptStart);
  if (!/\barmNextTimer\s*\(\s*\)\s*;\s*\n\s*return\s*\(\)/.test(afterAttempt)) {
    return false;
  }
  return true;
}

/** Regex guard on comment-stripped global-error.tsx. */
export function globalErrorRetryWiringOk(rawSrc) {
  const src = activeSource(rawSrc);
  return (
    src.length > 0 &&
    /from\s+["']@\/lib\/global-error-retry["']/.test(src) &&
    /\bcanAttemptGlobalErrorRetry\s*\(/.test(src) &&
    /\brecordGlobalErrorRetry\s*\(/.test(src) &&
    /\bglobalErrorFirstRetryDelayMs\s*\(/.test(src) &&
    /\breset\s*\(\s*\)/.test(src)
  );
}

/** Behavioural: useEffect tick auto-retries via cap + reset (not manual button only). */
export function globalErrorAppBehaviorOk(rawSrc) {
  const src = activeSource(rawSrc);
  if (!globalErrorRetryWiringOk(src)) return false;
  if (!/\buseEffect\s*\(/.test(src)) return false;
  const tick = src.match(/const tick\s*=\s*\(\)\s*=>\s*\{([\s\S]*?)\n\s*\};/);
  if (!tick) return false;
  const body = tick[1];
  if (!/\bcanAttemptGlobalErrorRetry\s*\(/.test(body)) return false;
  if (!/\brecordGlobalErrorRetry\s*\(/.test(body)) return false;
  if (
    !/if\s*\(\s*canAttemptGlobalErrorRetry[\s\S]*?\)\s*\{[\s\S]*?\breset\s*\(\s*\)/.test(
      body
    )
  ) {
    return false;
  }
  return /\bschedule\s*\(\s*globalErrorFirstRetryDelayMs\s*\(\s*\)\s*\)/.test(src);
}
