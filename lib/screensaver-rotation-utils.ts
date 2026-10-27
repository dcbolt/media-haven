/** Pure helpers for screensaver rotation (Node smoke / TV feed). */

/** Safety bound for corrupt settings rows; URL size guard is the operational limit. */
const MAX_HIDDEN = 500;

export function sanitizeScreensaverHiddenUrlList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const u of raw) {
    if (typeof u !== "string" || !u.startsWith("http") || u.length > 2000) continue;
    if (seen.has(u)) continue;
    seen.add(u);
    out.push(u);
    if (out.length >= MAX_HIDDEN) break;
  }
  return out;
}

export function filterOutHiddenScreensavers<T extends { url: string }>(
  assets: T[],
  hidden: Set<string>
): T[] {
  if (hidden.size === 0) return assets;
  return assets.filter((a) => !hidden.has(a.url));
}
