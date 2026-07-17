/**
 * Open-Meteo current weather + sun for Space Coast properties.
 * Extracted so /tv and the guest portal share one optional feed.
 * Never throws — callers treat null as "skip panel".
 */

export type WeatherSnap = {
  tempF: number;
  label: string;
};

export type SunSnap = {
  sunrise: string;
  sunset: string;
};

const WEATHER_LABELS: Record<number, string> = {
  0: "Clear",
  1: "Mostly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Foggy",
  51: "Light drizzle",
  61: "Light rain",
  63: "Rain",
  65: "Heavy rain",
  80: "Showers",
  95: "Thunderstorms",
};

/** Melbourne Beach default when a property has no lat/lon yet. */
export const MELBOURNE_BEACH = { lat: 28.06, lon: -80.56 };

export async function fetchWeather(
  lat: number,
  lon: number
): Promise<{ weather: WeatherSnap | null; sun: SunSnap | null }> {
  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&daily=sunrise,sunset&forecast_days=1&timezone=auto&temperature_unit=fahrenheit`,
      { signal: AbortSignal.timeout(5000), next: { revalidate: 900 } }
    );
    if (!res.ok) return { weather: null, sun: null };
    const data = (await res.json()) as {
      current?: { temperature_2m?: number; weather_code?: number };
      daily?: { sunrise?: string[]; sunset?: string[] };
    };
    const weather =
      data.current?.temperature_2m == null
        ? null
        : {
            tempF: Math.round(data.current.temperature_2m),
            label: WEATHER_LABELS[data.current.weather_code ?? -1] ?? "",
          };
    const sun =
      data.daily?.sunrise?.[0] && data.daily?.sunset?.[0]
        ? { sunrise: data.daily.sunrise[0], sunset: data.daily.sunset[0] }
        : null;
    return { weather, sun };
  } catch {
    return { weather: null, sun: null };
  }
}
