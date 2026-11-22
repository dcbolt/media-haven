import type { TvDeviceRow } from "@/lib/tv";

/** A TV is "online" if it has polled within 90s (poll interval is 10s). */
export function isOnline(lastSeen: string): boolean {
  return Date.now() - new Date(lastSeen).getTime() < 90_000;
}

export function ago(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function shortPropertyName(n: string): string {
  return n.split(" - ")[0].trim() || n;
}

/** Guest-facing first name for property section headers (fixture-safe labels). */
export function guestFirstName(guestLabel: string | null): string | null {
  if (!guestLabel) return null;
  const trimmed = guestLabel.trim();
  if (trimmed.startsWith("The ") && trimmed.endsWith("s")) {
    return trimmed.slice(4, -1);
  }
  const first = trimmed.split(/\s+/)[0];
  return first || trimmed;
}

export type PropertySection = {
  propertyId: string;
  name: string;
  tvs: TvDeviceRow[];
  onlineCount: number;
  occupied: boolean | null;
  guestLabel: string | null;
  combined: boolean;
};

export function buildPropertySections(
  devices: TvDeviceRow[],
  properties: { id: string; name: string }[]
): { sections: PropertySection[]; unassigned: TvDeviceRow[] } {
  const byProp = new Map<string, TvDeviceRow[]>();
  const unassigned: TvDeviceRow[] = [];
  for (const tv of devices) {
    if (!tv.property_id) {
      unassigned.push(tv);
      continue;
    }
    const arr = byProp.get(tv.property_id) ?? [];
    arr.push(tv);
    byProp.set(tv.property_id, arr);
  }

  const propName = new Map(properties.map((p) => [p.id, shortPropertyName(p.name)]));

  const sections: PropertySection[] = [];
  for (const [propertyId, tvs] of byProp.entries()) {
    const sample = tvs[0];
    const onlineCount = tvs.filter((d) => isOnline(d.last_seen)).length;
    sections.push({
      propertyId,
      name:
        propName.get(propertyId) ??
        (sample.property_name ? shortPropertyName(sample.property_name) : "Property"),
      tvs,
      onlineCount,
      occupied: sample.occupied ?? null,
      guestLabel: sample.guest_label ?? null,
      combined: tvs.some((d) => Boolean(d.joined_name)),
    });
  }

  sections.sort((a, b) => a.name.localeCompare(b.name));
  return { sections, unassigned };
}