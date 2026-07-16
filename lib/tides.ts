/**
 * Today's tide times from NOAA CO-OPS (free, keyless, official). Default
 * station 8721604 is Trident Pier, Port Canaveral — the closest station to
 * Melbourne Beach. Beach guests check tides every morning; this powers the
 * TV "Beach day" panel. Cached an hour; null on any failure (panel skipped).
 */

export interface TideEvent {
  type: "high" | "low";
  time: string; // ISO-ish local timestamp from NOAA
}

const DEFAULT_STATION = "8721604";

export async function fetchTides(
  station: string = DEFAULT_STATION
): Promise<TideEvent[] | null> {
  try {
    const url =
      "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter" +
      `?product=predictions&datum=MLLW&station=${station}` +
      "&time_zone=lst_ldt&units=english&interval=hilo&format=json&date=today";
    const res = await fetch(url, {
      signal: AbortSignal.timeout(6000),
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      predictions?: { t: string; type: "H" | "L" }[];
    };
    if (!data.predictions?.length) return null;
    return data.predictions.map((p) => ({
      type: p.type === "H" ? "high" : "low",
      time: p.t,
    }));
  } catch {
    return null;
  }
}

/** Demo fallback so the Beach day panel is always demonstrable. */
export function sampleTides(): TideEvent[] {
  const day = new Date().toISOString().slice(0, 10);
  return [
    { type: "low", time: `${day} 03:41` },
    { type: "high", time: `${day} 09:52` },
    { type: "low", time: `${day} 15:58` },
    { type: "high", time: `${day} 22:14` },
  ];
}

export function formatTideTime(t: string): string {
  const d = new Date(t.replace(" ", "T"));
  if (isNaN(d.getTime())) return t;
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}
