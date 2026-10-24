/**
 * Source wiring guards for TV self-reload + global-error retry (F-979).
 * Used by feature smokes and deletion-mutant proof.
 */

/** True when /tv still schedules budgeted nightly self-heal reloads. */
export function selfReloadWiringOk(src) {
  return (
    typeof src === "string" &&
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

/** True when app/global-error.tsx still auto-retries via shared recovery cap. */
export function globalErrorRetryWiringOk(src) {
  return (
    typeof src === "string" &&
    src.length > 0 &&
    /from\s+["']@\/lib\/global-error-retry["']/.test(src) &&
    /\bcanAttemptGlobalErrorRetry\s*\(/.test(src) &&
    /\brecordGlobalErrorRetry\s*\(/.test(src) &&
    /\bglobalErrorFirstRetryDelayMs\s*\(/.test(src) &&
    /\breset\s*\(\s*\)/.test(src)
  );
}
