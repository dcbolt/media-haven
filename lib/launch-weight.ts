import type { UpcomingLaunch } from "./launches";

// Client-safe on purpose: app/tv/page.tsx is a client component, and a
// VALUE import from lib/tv.ts would pull its server-only deps (supabase,
// fs/promises via screensavers) into the browser bundle. Types are fine —
// they erase — but runtime launch-weight math lives here.

// ── S1.6 launch-window auto-weight ─────────────────────────────────────
// When a Cape launch is near, the TV shows launch slides more often and
// earlier. Pure rotation math — no settings storage, no host toggle v1.
// Scrubbed / canceled / already-past NETs decay back to weight 1.

const LAUNCH_WEIGHT_WINDOW_MS = 24 * 3600_000; // boost inside 24h of NET
const LAUNCH_WEIGHT_STRONG_MS = 6 * 3600_000; // weight 3 inside 6h
const LAUNCH_WEIGHT_MED_MS = 12 * 3600_000; // weight 2 inside 12h
/** NET more than this past → ignore (launch happened or window closed). */
const LAUNCH_STALE_PAST_MS = 30 * 60_000;

/**
 * How many times launch-related slides should appear in the idle rotation.
 * 1 = normal (no boost), 2 = within ~24h of NET, 3 = within ~6h.
 * Scrubbed/canceled missions and past NETs do not boost (decay to 1).
 */
export function launchRotationWeight(
  launches: UpcomingLaunch[] | null | undefined,
  nowMs: number = Date.now()
): number {
  if (!launches?.length) return 1;
  let nearestMs = Infinity;
  for (const l of launches) {
    const net = new Date(l.net).getTime();
    if (!Number.isFinite(net)) continue;
    // Already past the window → silent.
    if (net < nowMs - LAUNCH_STALE_PAST_MS) continue;
    // Scrub / cancel / hard fail: no boost even if LL2 still lists them.
    // "Hold" with a future NET is still a live window (slip, not dead).
    const st = (l.status ?? "").trim();
    if (st && /scrub|cancel|fail/i.test(st)) continue;
    if (/hold/i.test(st) && net < nowMs) continue;
    const delta = net - nowMs;
    if (delta < nearestMs) nearestMs = delta;
  }
  if (!Number.isFinite(nearestMs) || nearestMs > LAUNCH_WEIGHT_WINDOW_MS) {
    return 1;
  }
  if (nearestMs <= LAUNCH_WEIGHT_STRONG_MS) return 3;
  if (nearestMs <= LAUNCH_WEIGHT_MED_MS) return 2;
  return 2; // 12–24h still worth a mild boost
}

const DEFAULT_LAUNCH_SLIDE_KEYS = ["launch-today", "launch-board"] as const;

/**
 * S1.6: pull launch slides earlier and multi-slot launch-board through the
 * deck. Only keys already present in `rotation` are boosted — a host who
 * parked launch-board stays parked. Never blanks: empty or weight ≤ 1
 * returns the input unchanged.
 */
export function applyLaunchWeightToRotation<T extends { key: string }>(
  rotation: T[],
  weight: number,
  launchKeys: readonly string[] = DEFAULT_LAUNCH_SLIDE_KEYS
): T[] {
  if (weight <= 1 || rotation.length === 0) return rotation;
  const launchSet = new Set(launchKeys);
  const samples = new Map<string, T>();
  for (const s of rotation) {
    // Ignore prior ~w duplicates if this ever re-runs on its own output.
    const baseKey = s.key.includes("~w") ? s.key.split("~w")[0]! : s.key;
    if (launchSet.has(baseKey) && !samples.has(baseKey)) {
      samples.set(baseKey, { ...s, key: baseKey } as T);
    }
  }
  if (samples.size === 0) return rotation;

  const base = rotation.filter((s) => {
    const baseKey = s.key.includes("~w") ? s.key.split("~w")[0]! : s.key;
    return !launchSet.has(baseKey);
  });
  // Prefer after farewell/welcome so the guest still lands on greeting first.
  let insertAt = 0;
  for (let i = 0; i < base.length; i++) {
    if (base[i].key === "farewell" || base[i].key === "welcome") {
      insertAt = i + 1;
    }
  }

  // launch-today once (long alert); launch-board once up front.
  const head: T[] = [];
  const today = samples.get("launch-today");
  if (today) head.push(today);
  const board = samples.get("launch-board");
  if (board) head.push(board);
  for (const [k, s] of samples) {
    if (k !== "launch-today" && k !== "launch-board") head.push(s);
  }

  const out = [...base];
  out.splice(insertAt, 0, ...head);

  // Extra board slots: weight 2 → +1 mid-deck, weight 3 → +2 spaced.
  if (board && weight > 1) {
    const extras = weight - 1;
    const bodyStart = insertAt + head.length;
    const bodyLen = Math.max(0, out.length - bodyStart);
    for (let e = 1; e <= extras; e++) {
      const dup = { ...board, key: `${board.key}~w${e}` } as T;
      const at =
        bodyLen === 0
          ? out.length
          : Math.min(
              out.length,
              bodyStart + Math.floor((bodyLen * e) / (extras + 1))
            );
      out.splice(at, 0, dup);
    }
  }

  return out;
}
