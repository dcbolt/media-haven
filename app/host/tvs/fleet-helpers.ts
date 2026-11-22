/** A TV is "online" if it has polled within 90s (poll interval is 10s). */
export function isTvOnline(lastSeen: string): boolean {
  return Date.now() - new Date(lastSeen).getTime() < 90_000;
}

/** Linked but heartbeat stale — fleet "stale" chip semantics. */
export function isTvStale(
  propertyId: string | null,
  lastSeen: string
): boolean {
  return Boolean(propertyId) && !isTvOnline(lastSeen);
}

export function ago(iso: string): string {
  const s = Math.max(
    0,
    Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  );
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/** First-name style lockup for compact tiles (fixture + live guest_label). */
export function guestFirstForTile(guestLabel: string | null): string | null {
  if (!guestLabel?.trim()) return null;
  const t = guestLabel.trim();
  if (t.startsWith("The ") && t.includes(" ")) {
    return t.slice(4).split(/\s+/)[0] ?? t;
  }
  return t.split(/\s+/)[0] ?? t;
}

export function nowPlayingTone(nowMode: string | undefined): string {
  return nowMode === "emergency"
    ? "text-amber-800"
    : nowMode === "vacant"
      ? "text-ocean-800/80"
      : nowMode === "guest"
        ? "text-seafoam-800"
        : "text-ocean-900/55";
}

export function nowPlayingBoxTone(nowMode: string | undefined): string {
  return nowMode === "emergency"
    ? "text-amber-800 bg-amber-50 border-amber-200"
    : nowMode === "vacant"
      ? "text-ocean-800/80 bg-ocean-50 border-ocean-100"
      : nowMode === "guest"
        ? "text-seafoam-800 bg-seafoam-50/80 border-seafoam-100"
        : "text-ocean-900/55 bg-sand-50 border-sand-200";
}