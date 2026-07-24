import { supabaseAdmin } from "./supabase";

/**
 * Guesty Open API client.
 *
 * Runs in mock mode until GUESTY_CLIENT_ID / GUESTY_CLIENT_SECRET are set, so
 * the portal works end-to-end before Open API access is approved. All Guesty
 * knowledge lives in this file — swapping mock → live touches nothing else.
 *
 * Token strategy: Guesty allows only 5 access-token requests per key per 24h
 * (tokens last ~24h). On serverless, minting a token per invocation would
 * exhaust that before lunch, so the token is cached in the guesty_tokens
 * table and shared across all invocations (~1 request/day).
 */

const GUESTY_OAUTH_URL = "https://open-api.guesty.com/oauth2/token";
const GUESTY_API_BASE = "https://open-api.guesty.com/v1";

export interface GuestyListing {
  _id: string;
  title: string;
  picture?: { thumbnail?: string; large?: string };
  pictures?: {
    thumbnail?: string;
    regular?: string;
    large?: string;
    original?: string;
  }[];
  address?: {
    full?: string;
    city?: string;
    state?: string;
    lat?: number;
    lng?: number;
  };
  customFields?: { fieldId: string; value: string }[];
}

/** Guesty photo URLs are Cloudinary. Thumbnail variants carry a
 *  transformation segment (…/image/upload/t_default_thumb/v123/…) that caps
 *  them at thumbnail size — strip it so the URL serves the full-resolution
 *  original. URLs without a transformation pass through unchanged. */
export function fullResPhoto(url: string): string {
  return url.replace(/(\/image\/upload\/).*?(v\d+\/)/, "$1$2");
}

/** Best-quality URLs from the listing's full photo set, deduped. Guesty's
 *  pictures[] carries `original` + `thumbnail` (no large/regular, despite
 *  older docs) — prefer original, and de-thumb whatever we end up with. */
export function extractPhotos(listing: GuestyListing, limit = 12): string[] {
  const urls = (listing.pictures ?? [])
    .map((p) => p.original ?? p.large ?? p.regular ?? p.thumbnail)
    .filter((u): u is string => Boolean(u))
    .map(fullResPhoto);
  return [...new Set(urls)].slice(0, limit);
}

/**
 * Wi-Fi lives on the Guesty listing as custom fields (each property has its
 * own SSID/password). Custom fields are account-specific, so the field IDs
 * are configured via env: GUESTY_WIFI_SSID_FIELD_ID / GUESTY_WIFI_PASSWORD_FIELD_ID
 * (Guesty dashboard → Settings → Custom fields → copy each field's ID).
 */
export function extractWifi(listing: GuestyListing): {
  ssid: string | null;
  password: string | null;
} {
  const ssidField = process.env.GUESTY_WIFI_SSID_FIELD_ID;
  const passField = process.env.GUESTY_WIFI_PASSWORD_FIELD_ID;
  const byId = (id?: string) =>
    (id && listing.customFields?.find((f) => f.fieldId === id)?.value) || null;
  return { ssid: byId(ssidField), password: byId(passField) };
}

export interface GuestyReservation {
  _id: string;
  listingId: string;
  status: string;
  checkIn: string; // ISO timestamp
  checkOut: string; // ISO timestamp
  guest: { fullName?: string; firstName?: string; lastName?: string };
  /** Origin platform ("airbnb2", "bookingCom", "manual", …). */
  source?: string;
  integration?: { platform?: string };
}

/**
 * Guesty statuses that represent a real stay. The reservations table
 * deliberately stores EVERY status the API returns (inquiry, declined,
 * expired, closed, canceled — sync needs them to revoke tokens), so any
 * query that means "actual booking" must filter to these. An inquiry once
 * rendered as a booking bar on the multi-calendar and could have flipped a
 * TV to occupied (found 2026-07-23, the "Emelina" bar).
 */
export const ACTIVE_STAY_STATUSES = ["confirmed", "reserved", "checked_in"];

export function guestyConfigured(): boolean {
  return Boolean(process.env.GUESTY_CLIENT_ID && process.env.GUESTY_CLIENT_SECRET);
}

async function getAccessToken(): Promise<string> {
  const db = supabaseAdmin();

  if (db) {
    const { data } = await db
      .from("guesty_tokens")
      .select("access_token, expires_at")
      .eq("id", 1)
      .maybeSingle();
    if (data && new Date(data.expires_at) > new Date()) {
      return data.access_token;
    }
  }

  const res = await fetch(GUESTY_OAUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      scope: "open-api",
      client_id: process.env.GUESTY_CLIENT_ID!,
      client_secret: process.env.GUESTY_CLIENT_SECRET!,
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Guesty token request failed: ${res.status} ${await res.text()}`);
  }

  // Trust expires_in from the response — Guesty's docs contradict themselves
  // (86400 in the strategy guide, 3600 in the sample). 5-minute safety margin.
  const body = (await res.json()) as { access_token: string; expires_in: number };
  const expiresAt = new Date(Date.now() + (body.expires_in - 300) * 1000);

  if (db) {
    await db.from("guesty_tokens").upsert({
      id: 1,
      access_token: body.access_token,
      expires_at: expiresAt.toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  return body.access_token;
}

async function guestyFetch<T>(path: string): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(`${GUESTY_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Guesty API ${path} failed: ${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Mock data — one realistic property + reservation so every flow is testable
// without credentials. Removed from responses the moment real creds exist.
// ---------------------------------------------------------------------------

export const MOCK_LISTING: GuestyListing = {
  _id: "mock-listing-1",
  title: "The Dunes",
  picture: { large: "/hero-placeholder.svg" },
  address: { full: "Melbourne Beach, FL", city: "Melbourne Beach", state: "FL" },
};

export const MOCK_RESERVATION: GuestyReservation = {
  _id: "mock-res-1",
  listingId: "mock-listing-1",
  status: "confirmed",
  checkIn: new Date(Date.now() - 86400_000).toISOString(),
  checkOut: new Date(Date.now() + 3 * 86400_000).toISOString(),
  guest: { fullName: "Alex Rivera", firstName: "Alex", lastName: "Rivera" },
};

export async function getListings(): Promise<GuestyListing[]> {
  if (!guestyConfigured()) return [MOCK_LISTING];
  const fields = encodeURIComponent("title picture pictures address customFields");
  const data = await guestyFetch<{ results: GuestyListing[] }>(
    `/listings?limit=100&fields=${fields}`
  );
  return data.results;
}

export async function getReservation(id: string): Promise<GuestyReservation> {
  if (!guestyConfigured()) return { ...MOCK_RESERVATION, _id: id };
  return guestyFetch<GuestyReservation>(`/reservations/${id}`);
}

/** Current + upcoming reservations (checkout in the future) for backfill
 *  when sync runs — the webhook keeps things current after that. */
export async function getUpcomingReservations(): Promise<GuestyReservation[]> {
  if (!guestyConfigured()) return [MOCK_RESERVATION];
  // Filter field per docs is checkOutDateLocalized with a date-only value.
  const today = new Date().toISOString().slice(0, 10);
  const filters = encodeURIComponent(
    JSON.stringify([
      { operator: "$gte", field: "checkOutDateLocalized", value: today },
    ])
  );
  const fields = encodeURIComponent("guest checkIn checkOut listingId status");
  const data = await guestyFetch<{ results: GuestyReservation[] }>(
    `/reservations?limit=100&fields=${fields}&filters=${filters}`
  );
  return data.results;
}

/**
 * Reservation origin platforms for the multi-calendar's per-source colors
 * (Guesty reservation id → raw source string). The synced reservations
 * table carries no source column (settings-jsonb era, no migrations), so
 * the calendar enriches at render time. Memoized 5 min; any failure
 * returns the last good map (or empty — calendar falls back to one color).
 */
const SOURCE_TTL_MS = 5 * 60_000;
let sourceCache: { at: number; map: Map<string, string> } | null = null;

export async function getReservationSources(
  fromDate: string
): Promise<Map<string, string>> {
  if (!guestyConfigured()) return new Map();
  if (sourceCache && Date.now() - sourceCache.at < SOURCE_TTL_MS) {
    return sourceCache.map;
  }
  try {
    const filters = encodeURIComponent(
      JSON.stringify([
        { operator: "$gte", field: "checkOutDateLocalized", value: fromDate },
      ])
    );
    const fields = encodeURIComponent("source integration listingId checkIn");
    const map = new Map<string, string>();
    // Two pages of 100 cover ~5 months across six listings with headroom.
    for (const skip of [0, 100]) {
      const data = await guestyFetch<{ results: GuestyReservation[] }>(
        `/reservations?limit=100&skip=${skip}&fields=${fields}&filters=${filters}`
      );
      for (const r of data.results) {
        const src = r.source || r.integration?.platform;
        if (src) map.set(r._id, src);
      }
      if (data.results.length < 100) break;
    }
    sourceCache = { at: Date.now(), map };
    return map;
  } catch {
    return sourceCache?.map ?? new Map();
  }
}

/** True when every night in [from, to) is bookable on the listing's
 *  calendar; null when Guesty isn't configured or the answer is unknown
 *  (API shape drift, request failure) — callers must treat null as "don't
 *  promise availability". Dates are YYYY-MM-DD. */
export async function isRangeAvailable(
  listingId: string,
  from: string,
  to: string
): Promise<boolean | null> {
  if (!guestyConfigured()) return true; // mock mode: demonstrable flow
  try {
    const data = await guestyFetch<{
      data?: { days?: { date: string; status?: string }[] };
      days?: { date: string; status?: string }[];
    }>(`/availability-pricing/api/calendar/listings/${listingId}?startDate=${from}&endDate=${to}`);
    const days = data.data?.days ?? data.days;
    if (!Array.isArray(days) || days.length === 0) return null;
    // The checkout day itself doesn't need to be free.
    return days
      .filter((d) => d.date >= from && d.date < to)
      .every((d) => d.status === "available");
  } catch {
    return null;
  }
}
