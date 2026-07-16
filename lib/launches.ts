/**
 * Upcoming rocket launches visible from the property's beach. Source is
 * The Space Devs Launch Library 2, filtered to Cape Canaveral SFS (12) and
 * Kennedy Space Center (27) — everything launched there is visible from
 * Melbourne Beach. Free tier allows 15 requests/hour; the 15-minute
 * revalidate cache keeps us comfortably under across all TVs.
 */

export interface UpcomingLaunch {
  name: string;
  vehicle: string | null;
  provider: string | null;
  net: string; // ISO timestamp, "no earlier than"
  status: string | null;
}

const LL2_URL =
  "https://ll.thespacedevs.com/2.2.0/launch/upcoming/" +
  "?limit=4&location__ids=12,27&hide_recent_previous=true&mode=list";

interface Ll2Launch {
  name?: string;
  net?: string;
  status?: { abbrev?: string };
  launch_service_provider?: { name?: string };
  rocket?: { configuration?: { full_name?: string } };
}

export async function fetchUpcomingLaunches(): Promise<UpcomingLaunch[] | null> {
  try {
    const res = await fetch(LL2_URL, {
      signal: AbortSignal.timeout(6000),
      next: { revalidate: 900 },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { results?: Ll2Launch[] };
    if (!data.results?.length) return null;
    return data.results
      .filter((l) => l.name && l.net)
      .map((l) => ({
        name: l.name!,
        vehicle: l.rocket?.configuration?.full_name ?? null,
        provider: l.launch_service_provider?.name ?? null,
        net: l.net!,
        status: l.status?.abbrev ?? null,
      }));
  } catch {
    return null; // panel falls back to the static guide text
  }
}

/** Demo/fallback: two plausible launches so the panel is always
 *  demonstrable — one inside the 12h countdown window, one days out. */
export function sampleLaunches(): UpcomingLaunch[] {
  return [
    {
      name: "Starlink Group 12-31",
      vehicle: "Falcon 9 Block 5",
      provider: "SpaceX",
      net: new Date(Date.now() + 8 * 3600_000).toISOString(),
      status: "Go",
    },
    {
      name: "USSF-87",
      vehicle: "Vulcan VC4S",
      provider: "United Launch Alliance",
      net: new Date(Date.now() + 3 * 86400_000 + 5 * 3600_000).toISOString(),
      status: "Go",
    },
  ];
}
